import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { formatDay } from "@/lib/agenda/time";
import type { Availability } from "@/lib/bot/slots";
import type { NormalizedEvent } from "@/lib/channels/types";
import { sendAutomatic, type AutomaticTarget } from "@/lib/inbox/automatic";
import { logEvent } from "@/lib/log";
import { MAX_MESSAGE_AGE_MS, type BusinessHours } from "@/lib/replies/auto-reply";
import type { Enums } from "@/lib/supabase/database.types";
import type { AdminClient } from "@/lib/supabase/server";
import { isAssistantEnabled } from "../assistant";
import { HANDOFF_PAUSE_HOURS, agentQuietReason, type AgentSettings } from "./config";
import { runAgentTurn, type AgentTurn, type CreateMessage } from "./loop";
import { contextPrompt, historyToMessages, stablePrompt, MAX_HISTORY_MESSAGES, type HistoryMessage } from "./prompt";
import { BOOKING_HORIZON_DAYS, agentTools, runAgentTool, type AgentAction, type AgentPort } from "./tools";

const MODEL = "claude-opus-5-5";
/** Longer than one AI turn takes; a crashed run frees the conversation after this. */
const LEASE_MS = 2 * 60_000;
/** A customer who sends three messages in a row gets one answer that reads all three. */
const MAX_ROUNDS = 3;
/** Messages a person on the team wrote: sent from Fidera or from the phone. */
const TEAM_ORIGINS = ["api", "business_app_echo"] as const;

let client: Anthropic | null = null;

const createMessage: CreateMessage = async ({ system, messages, tools }) => {
  client ??= new Anthropic({ timeout: 60_000, maxRetries: 1 });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system,
    messages,
    tools,
  });
  logEvent("ai_agent.usage", {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
    cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    stop: response.stop_reason,
  });
  return response;
};

export async function getAgentSettings(admin: AdminClient, organizationId: string): Promise<AgentSettings | null> {
  const { data } = await admin.from("ai_agent_settings").select("*").eq("organization_id", organizationId).maybeSingle();
  if (!data) return null;
  return {
    enabled: data.enabled,
    instructions: data.instructions,
    mode: data.mode === "outside_hours" ? "outside_hours" : "always",
    canBook: data.can_book,
    canCancel: data.can_cancel,
    pauseAfterTeamHours: data.pause_after_team_hours,
    handoffDepartmentId: data.handoff_department_id,
  };
}

/** True when the AI attendant is on for the business: the menu bot and automatic replies stay quiet. */
export async function isAgentOn(admin: AdminClient, organizationId: string): Promise<boolean> {
  if (!isAssistantEnabled()) return false;
  const { data } = await admin.from("ai_agent_settings").select("enabled").eq("organization_id", organizationId).maybeSingle();
  return data?.enabled === true;
}

/**
 * Answers new customer messages with the AI attendant, when it is on. Returns the message ids it
 * took. One failure never stops the others or the webhook.
 */
export async function runAiAgent(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  events: NormalizedEvent[],
  options: { now?: () => Date; createMessage?: CreateMessage } = {},
): Promise<Set<string>> {
  const now = options.now ?? (() => new Date());
  const call = options.createMessage ?? createMessage;
  const handled = new Set<string>();
  if (!isAssistantEnabled()) return handled;
  for (const event of events) {
    if (event.kind !== "message" || event.direction !== "inbound" || event.origin !== "customer") continue;
    if (now().getTime() - event.occurredAt.getTime() > MAX_MESSAGE_AGE_MS) continue;
    try {
      if (await handle(admin, providerName, event, now, call)) handled.add(event.externalMessageId);
    } catch (e) {
      logEvent("ai_agent.failed", { error: e instanceof Error ? e.message : "unknown" }, "error");
    }
  }
  return handled;
}

async function lastTeamMessageAt(admin: AdminClient, conversationId: string): Promise<string | null> {
  const { data } = await admin
    .from("messages")
    .select("occurred_at")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .in("origin", [...TEAM_ORIGINS])
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.occurred_at ?? null;
}

async function loadAvailability(admin: AdminClient, organizationId: string, businessHours: BusinessHours, now: Date): Promise<Availability> {
  const [staff, booked] = await Promise.all([
    admin.from("memberships").select("user_id, work_hours").eq("organization_id", organizationId).eq("bookable", true),
    admin
      .from("appointments")
      .select("staff_id, starts_at, ends_at")
      .eq("organization_id", organizationId)
      .eq("status", "scheduled")
      .gte("ends_at", now.toISOString())
      .lt("starts_at", new Date(now.getTime() + (BOOKING_HORIZON_DAYS + 2) * 86_400_000).toISOString()),
  ]);
  return {
    businessHours,
    staff: (staff.data ?? []).map((m) => ({ id: m.user_id, workHours: m.work_hours as unknown as BusinessHours | null })),
    booked: (booked.data ?? []).map((b) => ({ staffId: b.staff_id, startsAt: b.starts_at, endsAt: b.ends_at })),
    now,
  };
}

/** Takes the conversation for this run. False: another run has it, or it is paused. */
async function claim(admin: AdminClient, organizationId: string, conversationId: string, now: Date): Promise<boolean> {
  await admin
    .from("ai_conversation_state")
    .upsert({ conversation_id: conversationId, organization_id: organizationId }, { onConflict: "conversation_id", ignoreDuplicates: true });
  const at = now.toISOString();
  const { data } = await admin
    .from("ai_conversation_state")
    .update({ running_until: new Date(now.getTime() + LEASE_MS).toISOString(), updated_at: at })
    .eq("conversation_id", conversationId)
    // Free (no run, or a crashed run's lease ran out) and not paused.
    .or(`and(or(running_until.is.null,running_until.lt."${at}"),or(paused_until.is.null,paused_until.lt."${at}"))`)
    .select("conversation_id");
  return !!data?.length;
}

async function release(admin: AdminClient, conversationId: string) {
  await admin.from("ai_conversation_state").update({ running_until: null }).eq("conversation_id", conversationId);
}

async function handle(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  event: Extract<NormalizedEvent, { kind: "message" }>,
  now: () => Date,
  call: CreateMessage,
): Promise<boolean> {
  const { data: account } = await admin
    .from("channel_accounts")
    .select("id, organization_id, status")
    .eq("provider", providerName)
    .eq("channel", event.channel)
    .eq("external_account_id", event.accountExternalId)
    .maybeSingle();
  if (account?.status !== "active") return false;
  const organizationId = account.organization_id;

  const settings = await getAgentSettings(admin, organizationId);
  if (!settings?.enabled) return false;

  const { data: message } = await admin
    .from("messages")
    .select("id, conversation_id, conversations(contact_id, last_outbound_at, contacts(display_name))")
    .eq("channel_account_id", account.id)
    .eq("external_message_id", event.externalMessageId)
    .maybeSingle();
  if (!message?.conversations) return false;
  const conversationId = message.conversation_id;
  const contactId = message.conversations.contact_id;
  // A rating answer gets its own thanks.
  const { data: rating } = await admin.from("nps_surveys").select("id").eq("response_message_id", message.id).maybeSingle();
  if (rating) return true;

  const [hoursRow, stateRow, teamAt, aiReplies] = await Promise.all([
    admin.from("auto_reply_settings").select("business_hours").eq("organization_id", organizationId).maybeSingle(),
    admin.from("ai_conversation_state").select("paused_until").eq("conversation_id", conversationId).maybeSingle(),
    lastTeamMessageAt(admin, conversationId),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .eq("origin", "automation")
      .gte("occurred_at", new Date(now().getTime() - 86_400_000).toISOString()),
  ]);
  const businessHours = (hoursRow.data?.business_hours ?? {}) as unknown as BusinessHours;
  const quiet = agentQuietReason({
    settings,
    now: now(),
    businessHours,
    pausedUntil: stateRow.data?.paused_until ?? null,
    lastTeamMessageAt: teamAt,
    aiRepliesLastDay: aiReplies.count ?? 0,
  });
  if (quiet) {
    logEvent("ai_agent.quiet", { conversationId, reason: quiet });
    return true;
  }
  if (!(await claim(admin, organizationId, conversationId, now()))) return true;

  try {
    await answer(admin, providerName, {
      event,
      settings,
      organizationId,
      accountId: account.id,
      conversationId,
      contactId,
      clientName: message.conversations.contacts?.display_name ?? null,
      businessHours,
      teamAt,
      now,
      call,
    });
  } finally {
    await release(admin, conversationId);
  }
  return true;
}

async function answer(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  input: {
    event: Extract<NormalizedEvent, { kind: "message" }>;
    settings: AgentSettings;
    organizationId: string;
    accountId: string;
    conversationId: string;
    contactId: string;
    clientName: string | null;
    businessHours: BusinessHours;
    teamAt: string | null;
    now: () => Date;
    call: CreateMessage;
  },
) {
  const { settings, organizationId, conversationId, contactId, now } = input;
  const { data: services } = await admin
    .from("services")
    .select("id, name, duration_minutes")
    .eq("organization_id", organizationId)
    .order("name");
  const agentServices = (services ?? []).map((s) => ({ id: s.id, name: s.name, durationMinutes: s.duration_minutes }));
  const stable = stablePrompt({ settings, services: agentServices, businessHours: input.businessHours });
  const tools = agentTools(settings);

  let availability: Availability | null = null;
  const port: AgentPort = {
    availability: async (fresh) => {
      if (!availability || fresh) availability = await loadAvailability(admin, organizationId, input.businessHours, now());
      return availability;
    },
    upcoming: async () => {
      const { data } = await admin
        .from("appointments")
        .select("id, service, starts_at")
        .eq("organization_id", organizationId)
        .eq("contact_id", contactId)
        .eq("status", "scheduled")
        .gte("starts_at", now().toISOString())
        .order("starts_at")
        .limit(10);
      return (data ?? []).map((a) => ({ id: a.id, service: a.service, startsAt: a.starts_at }));
    },
    book: async (b) => {
      const { data, error } = await admin
        .from("appointments")
        .insert({
          organization_id: organizationId,
          client_name: b.clientName,
          contact_id: contactId,
          conversation_id: conversationId,
          staff_id: b.staffId,
          service: b.serviceName,
          starts_at: b.startsAt,
          ends_at: b.endsAt,
          created_by: null,
        })
        .select("id")
        .single();
      if (error?.code === "23P01") return { ok: false, reason: "conflict" };
      if (error || !data) {
        logEvent("ai_agent.booking_failed", { conversationId, code: error?.code ?? null }, "error");
        return { ok: false, reason: "failed" };
      }
      return { ok: true, id: data.id };
    },
    cancel: async (id) => {
      const { data } = await admin
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .eq("contact_id", contactId)
        .eq("status", "scheduled")
        .select("id");
      return !!data?.length;
    },
    handoff: async () => {
      await admin
        .from("ai_conversation_state")
        .update({ paused_until: new Date(now().getTime() + HANDOFF_PAUSE_HOURS * 3_600_000).toISOString() })
        .eq("conversation_id", conversationId);
      if (settings.handoffDepartmentId) {
        await admin
          .from("conversations")
          .update({ department_id: settings.handoffDepartmentId })
          .eq("id", conversationId)
          .eq("organization_id", organizationId);
      }
    },
  };

  let turn: AgentTurn | null = null;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { data: rows } = await admin
      .from("messages")
      .select("id, direction, type, body")
      .eq("conversation_id", conversationId)
      .order("occurred_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);
    const history = (rows ?? []).reverse();
    const messages = historyToMessages(history as HistoryMessage[]);
    if (!messages) return;
    const latestId = history.at(-1)?.id;

    turn = await runAgentTurn({
      createMessage: input.call,
      system: [
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextPrompt({ now: now(), clientName: input.clientName, channel: input.event.channel }) },
      ],
      messages,
      tools,
      runTool: (name, toolInput) => runAgentTool(name, toolInput, { settings, services: agentServices, port }),
    });

    // A new message arrived while the AI thought: answer everything at once, unless it already acted.
    const { data: newest } = await admin
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (newest?.id === latestId || turn.actions.length > 0) break;
  }
  if (!turn) return;

  await writeNotes(admin, organizationId, conversationId, turn.actions);
  logEvent("ai_agent.turn", { conversationId, status: turn.status, actions: turn.actions.map((a) => a.kind).join(",") });

  if (turn.status === "declined" || turn.status === "failed") {
    // Silent to the customer; the conversation simply waits for the team, who sees why.
    await admin.from("conversation_notes").insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      author_id: null,
      body: "A IA não conseguiu responder esta mensagem. Alguém da equipe precisa responder.",
    });
    return;
  }
  const text =
    turn.status === "reply" ? turn.text : turn.actions.some((a) => a.kind === "handoff") ? "Vou chamar alguém da equipe para continuar com você." : null;
  if (!text) return;

  // The team wrote while the AI was thinking: theirs is the conversation.
  if ((await lastTeamMessageAt(admin, conversationId)) !== input.teamAt) return;

  const { data: conversation } = await admin.from("conversations").select("last_outbound_at").eq("id", conversationId).single();
  const target: AutomaticTarget = {
    organizationId,
    accountId: input.accountId,
    conversationId,
    lastOutboundAt: conversation?.last_outbound_at ?? null,
    accountExternalId: input.event.accountExternalId,
    channel: input.event.channel,
    to: input.event.contact.externalId,
  };
  const result = await sendAutomatic(admin, providerName, target, text);
  if (result === "hourly_limit" || !result.ok) {
    logEvent("ai_agent.send_failed", { conversationId, reason: result === "hourly_limit" ? "hourly_limit" : result.errorCode }, "warn");
  }
}

function noteFor(action: AgentAction): string {
  const day = (d: string) => formatDay(d);
  switch (action.kind) {
    case "booked":
      return `IA agendou: ${action.service}, ${day(action.day)} às ${action.time}.`;
    case "cancelled":
      return `IA cancelou: ${action.service ?? "atendimento"}, ${day(action.day)} às ${action.time}.`;
    case "handoff":
      return `IA passou para a equipe: ${action.reason}`;
  }
}

async function writeNotes(admin: AdminClient, organizationId: string, conversationId: string, actions: AgentAction[]) {
  if (actions.length === 0) return;
  await admin.from("conversation_notes").insert(
    actions.map((action) => ({ organization_id: organizationId, conversation_id: conversationId, author_id: null, body: noteFor(action) })),
  );
}
