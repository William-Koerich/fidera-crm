import "server-only";
import { formatPhone } from "@/lib/inbox/format";
import { sendAutomatic, type AutomaticTarget } from "@/lib/inbox/automatic";
import { isAgentOn } from "@/lib/ai/agent/runner";
import { logEvent } from "@/lib/log";
import type { NormalizedEvent } from "@/lib/channels/types";
import type { BusinessHours } from "@/lib/replies/auto-reply";
import { MAX_MESSAGE_AGE_MS } from "@/lib/replies/auto-reply";
import type { Enums, Json } from "@/lib/supabase/database.types";
import type { AdminClient } from "@/lib/supabase/server";
import { localDateTimeToIso } from "../agenda/time";
import type { BotSettings } from "./config";
import { bookedText, retryAfterConflict, startBot, stepBot, type BotContext, type BotState, type BotTurn, type Booking } from "./engine";
import { daysWithSlots, freeSlots, type Availability } from "./slots";

/** Past this, a half-finished flow starts over instead of resuming. */
const SESSION_IDLE_MS = 30 * 60_000;
/** The bot only takes a conversation that has been quiet this long: otherwise the team is in it. */
const NEW_ATTENDANCE_GAP_MS = 12 * 3_600_000;

interface Session {
  state: BotState;
  version: number;
  updatedAt: string;
}

async function loadAvailability(admin: AdminClient, organizationId: string, now: Date): Promise<Availability> {
  const [hours, staff, booked] = await Promise.all([
    admin.from("auto_reply_settings").select("business_hours").eq("organization_id", organizationId).maybeSingle(),
    admin.from("memberships").select("user_id, work_hours").eq("organization_id", organizationId).eq("bookable", true),
    admin
      .from("appointments")
      .select("staff_id, starts_at, ends_at")
      .eq("organization_id", organizationId)
      .eq("status", "scheduled")
      .gte("ends_at", now.toISOString())
      .lt("starts_at", new Date(now.getTime() + 16 * 86_400_000).toISOString()),
  ]);
  return {
    businessHours: (hours.data?.business_hours ?? {}) as unknown as BusinessHours,
    staff: (staff.data ?? []).map((m) => ({ id: m.user_id, workHours: m.work_hours as unknown as BusinessHours | null })),
    booked: (booked.data ?? []).map((b) => ({ staffId: b.staff_id, startsAt: b.starts_at, endsAt: b.ends_at })),
    now,
  };
}

async function buildContext(admin: AdminClient, organizationId: string, settings: BotSettings, now: Date): Promise<BotContext> {
  const { data: services } = await admin
    .from("services")
    .select("id, name, duration_minutes")
    .eq("organization_id", organizationId)
    .order("name");
  let availability: Availability | null = null;
  const load = async () => (availability ??= await loadAvailability(admin, organizationId, now));
  // Loaded once per turn, only when a step needs it.
  const ready = settings.options.some((o) => o.action === "book") ? await load() : null;
  return {
    settings,
    services: (services ?? []).map((s) => ({ id: s.id, name: s.name, durationMinutes: s.duration_minutes })),
    days: (minutes) => (ready ? daysWithSlots(minutes, ready) : []),
    times: (day, minutes) => (ready ? freeSlots(day, minutes, ready) : []),
  };
}

/** Saves the new state only if nobody advanced it meanwhile. False means another run has it. */
async function save(admin: AdminClient, conversationId: string, organizationId: string, session: Session | null, state: BotState) {
  const json = state as unknown as Json;
  if (session) {
    const { data } = await admin
      .from("bot_sessions")
      .update({ state: json, version: session.version + 1, updated_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("version", session.version)
      .select("version");
    return !!data?.length;
  }
  const { error } = await admin.from("bot_sessions").insert({ conversation_id: conversationId, organization_id: organizationId, state: json });
  return !error;
}

/**
 * Answers new customer messages with the bot, when it is on. Returns the message ids it took,
 * so the automatic replies stay quiet for them.
 */
export async function runBot(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  events: NormalizedEvent[],
  now = new Date(),
): Promise<Set<string>> {
  const handled = new Set<string>();
  for (const event of events) {
    if (event.kind !== "message" || event.direction !== "inbound" || event.origin !== "customer") continue;
    if (now.getTime() - event.occurredAt.getTime() > MAX_MESSAGE_AGE_MS) continue;
    try {
      if (await handle(admin, providerName, event, now)) handled.add(event.externalMessageId);
    } catch (e) {
      logEvent("bot.failed", { error: e instanceof Error ? e.message : "unknown" }, "error");
    }
  }
  return handled;
}

async function handle(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  event: Extract<NormalizedEvent, { kind: "message" }>,
  now: Date,
): Promise<boolean> {
  const { data: account } = await admin
    .from("channel_accounts")
    .select("id, organization_id, status")
    .eq("provider", providerName)
    .eq("channel", event.channel)
    .eq("external_account_id", event.accountExternalId)
    .maybeSingle();
  if (account?.status !== "active") return false;

  const { data: row } = await admin.from("bot_settings").select("*").eq("organization_id", account.organization_id).maybeSingle();
  if (!row?.enabled) return false;
  // The AI attendant answers instead, when it is on.
  if (await isAgentOn(admin, account.organization_id)) return false;
  const settings: BotSettings = {
    enabled: row.enabled,
    welcome: row.welcome,
    handoffText: row.handoff_text,
    options: row.options as unknown as BotSettings["options"],
  };

  const { data: message } = await admin
    .from("messages")
    .select("id, conversation_id, occurred_at, type, body, conversations(last_outbound_at, contacts(display_name, phone_normalized))")
    .eq("channel_account_id", account.id)
    .eq("external_message_id", event.externalMessageId)
    .maybeSingle();
  if (!message?.conversations) return false;
  // A rating answer gets its own thanks.
  const { data: rating } = await admin.from("nps_surveys").select("id").eq("response_message_id", message.id).maybeSingle();
  if (rating) return false;

  const { data: sessionRow } = await admin
    .from("bot_sessions")
    .select("state, version, updated_at")
    .eq("conversation_id", message.conversation_id)
    .maybeSingle();
  const session: Session | null = sessionRow
    ? { state: sessionRow.state as unknown as BotState, version: sessionRow.version, updatedAt: sessionRow.updated_at }
    : null;
  const active = session && session.state.step !== "ended" && now.getTime() - Date.parse(session.updatedAt) < SESSION_IDLE_MS;

  const context = await buildContext(admin, account.organization_id, settings, now);
  let turn: BotTurn;
  if (active) {
    turn = stepBot(session.state, message.type === "text" ? (message.body ?? "") : "", context);
  } else {
    const { data: previous } = await admin
      .from("messages")
      .select("occurred_at")
      .eq("conversation_id", message.conversation_id)
      .lt("occurred_at", message.occurred_at)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previous && Date.parse(message.occurred_at) - Date.parse(previous.occurred_at) < NEW_ATTENDANCE_GAP_MS) return false;
    turn = startBot(context);
  }
  if (!(await save(admin, message.conversation_id, account.organization_id, session, turn.state))) return true;

  const target: AutomaticTarget = {
    organizationId: account.organization_id,
    accountId: account.id,
    conversationId: message.conversation_id,
    lastOutboundAt: message.conversations.last_outbound_at,
    accountExternalId: event.accountExternalId,
    channel: event.channel,
    to: event.contact.externalId,
  };
  const send = async (text: string) => {
    const result = await sendAutomatic(admin, providerName, target, text);
    if (result !== "hourly_limit" && result.ok) return true;
    // Silent from here: the conversation is waiting for the team anyway.
    await admin.from("bot_sessions").update({ state: { step: "ended", attempts: 0 } }).eq("conversation_id", message.conversation_id);
    logEvent("bot.send_stopped", { conversationId: message.conversation_id, reason: result === "hourly_limit" ? "hourly_limit" : result.errorCode }, "warn");
    return false;
  };

  for (const reply of turn.replies) if (!(await send(reply))) return true;

  if (turn.handoff?.departmentId) {
    await admin
      .from("conversations")
      .update({ department_id: turn.handoff.departmentId })
      .eq("id", message.conversation_id)
      .eq("organization_id", account.organization_id);
  }
  if (turn.book) {
    const contact = message.conversations.contacts;
    await book(admin, { target, booking: turn.book, clientName: contact?.display_name || formatPhone(contact?.phone_normalized) || "Cliente", send, context });
  }
  return true;
}

async function book(
  admin: AdminClient,
  input: {
    target: AutomaticTarget;
    booking: Booking;
    clientName: string;
    send: (text: string) => Promise<boolean>;
    context: BotContext;
  },
) {
  const { target, booking } = input;
  const { data: conversation } = await admin.from("conversations").select("contact_id").eq("id", target.conversationId).single();
  const startsAt = localDateTimeToIso(booking.day, booking.time);
  const { error } = await admin.from("appointments").insert({
    organization_id: target.organizationId,
    client_name: input.clientName,
    contact_id: conversation?.contact_id ?? null,
    conversation_id: target.conversationId,
    staff_id: booking.staffId,
    service: booking.serviceName,
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + booking.durationMinutes * 60_000).toISOString(),
    created_by: null,
  });

  if (error?.code === "23P01") {
    const retry = retryAfterConflict(input.context, booking);
    const { data: session } = await admin.from("bot_sessions").select("version").eq("conversation_id", target.conversationId).single();
    await admin
      .from("bot_sessions")
      .update({ state: retry.state as unknown as Json, version: (session?.version ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq("conversation_id", target.conversationId);
    for (const reply of retry.replies) if (!(await input.send(reply))) return;
    return;
  }
  if (error) {
    logEvent("bot.booking_failed", { conversationId: target.conversationId, code: error.code }, "error");
    await input.send("Não consegui concluir o agendamento. Já vou chamar alguém da equipe.");
    return;
  }

  await input.send(bookedText(booking));
  await admin.from("conversation_notes").insert({
    organization_id: target.organizationId,
    conversation_id: target.conversationId,
    author_id: null,
    body: `Agendado pelo robô: ${booking.serviceName}, ${booking.day.split("-").reverse().join("/")} às ${booking.time}.`,
  });
}
