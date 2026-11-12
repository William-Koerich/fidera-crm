/**
 * Automatic replies. The rules and the flow live here, free of database and
 * framework code; AutoReplyStore is the only way out.
 *
 * They exist to acknowledge a customer, not to answer them: the conversation
 * stays awaiting a human reply.
 */
import type { ChannelProvider, NormalizedEvent, NormalizedMessageEvent } from "../channels/types";

export const BUSINESS_TIMEZONE = "America/Sao_Paulo";
/** At most one away message per conversation in this period. */
export const AWAY_COOLDOWN_MS = 12 * 3_600_000;
/** A retry or backlog must not answer a message from long ago. */
export const MAX_MESSAGE_AGE_MS = 10 * 60_000;
/**
 * Protects the number: a QR Code session can be restricted for high automated volume. Shared by
 * automatic replies, ratings and the bot; a booking through the bot takes about five messages.
 */
export const MAX_AUTO_REPLIES_PER_HOUR = 60;

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

export interface DayHours {
  open: string;
  close: string;
}
export type BusinessHours = Record<string, DayHours | undefined>;

export const GREETING_FORMATS = ["text", "audio"] as const;
export type GreetingFormat = (typeof GREETING_FORMATS)[number];

export interface AutoReplySettings {
  greetingEnabled: boolean;
  /** Text, or the voice note the business recorded. */
  greetingFormat: GreetingFormat;
  greetingText: string;
  /** Storage path of the voice note, already in WhatsApp's format. */
  greetingAudioPath: string | null;
  awayEnabled: boolean;
  awayText: string;
  businessHours: BusinessHours;
}

export type AutoReplyKind = "greeting" | "away";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_INDEX: Record<string, string> = { Sun: "0", Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6" };

export function isWithinBusinessHours(now: Date, hours: BusinessHours, timeZone = BUSINESS_TIMEZONE): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = hours[WEEKDAY_INDEX[part("weekday")] ?? ""];
  const time = `${part("hour")}:${part("minute")}`;
  return !!day && time >= day.open && time < day.close;
}

export interface AutoReplyDecision {
  kind: AutoReplyKind;
  /** The text; for a voice-note greeting, what is sent if the audio cannot be. */
  body: string;
  /** Set when the greeting goes as a voice note. */
  audioPath?: string;
}

/**
 * Which reply a new customer message gets, if any. Outside hours wins: it says when someone will
 * answer. With the AI attendant on, only the greeting goes out: the AI answers the rest, at any hour.
 */
export function decideAutoReply(input: {
  settings: AutoReplySettings;
  now: Date;
  isFirstMessage: boolean;
  greetedAt: string | null;
  lastAwayReplyAt: string | null;
  agentOn?: boolean;
}): AutoReplyDecision | null {
  const { settings, now } = input;
  if (!input.agentOn && settings.awayEnabled && !isWithinBusinessHours(now, settings.businessHours)) {
    const last = input.lastAwayReplyAt ? new Date(input.lastAwayReplyAt).getTime() : null;
    return last !== null && now.getTime() - last < AWAY_COOLDOWN_MS ? null : { kind: "away", body: settings.awayText };
  }
  if (settings.greetingEnabled && input.isFirstMessage && !input.greetedAt) {
    if (settings.greetingFormat === "audio" && settings.greetingAudioPath) {
      return { kind: "greeting", body: settings.greetingText, audioPath: settings.greetingAudioPath };
    }
    return settings.greetingText ? { kind: "greeting", body: settings.greetingText } : null;
  }
  return null;
}

/** Reads the weekday fields of BusinessHoursFields. The prefix tells several schedules in one form apart. */
export function parseBusinessHours(
  get: (name: string) => string | null,
  prefix = "",
): { ok: true; hours: BusinessHours } | { ok: false; message: string } {
  const hours: BusinessHours = {};
  for (const [index, name] of WEEKDAYS.entries()) {
    if (get(`${prefix}day_${index}_enabled`) !== "on") continue;
    const open = get(`${prefix}day_${index}_open`) ?? "";
    const close = get(`${prefix}day_${index}_close`) ?? "";
    if (!TIME.test(open) || !TIME.test(close) || open >= close) {
      return { ok: false, message: `${name}: o horário de início precisa ser antes do fim.` };
    }
    hours[String(index)] = { open, close };
  }
  return { ok: true, hours };
}

/** Validates the settings form. Enabling something requires what it needs to work. */
export function parseAutoReplyForm(
  get: (name: string) => string | null,
): { ok: true; settings: AutoReplySettings } | { ok: false; message: string } {
  const greetingEnabled = get("greeting_enabled") === "on";
  const awayEnabled = get("away_enabled") === "on";
  const greetingFormat: GreetingFormat = get("greeting_format") === "audio" ? "audio" : "text";
  const greetingText = (get("greeting_text") ?? "").trim();
  const greetingAudioPath = (get("greeting_audio_path") ?? "").trim() || null;
  const awayText = (get("away_text") ?? "").trim();
  if (greetingEnabled && greetingFormat === "text" && !greetingText) return { ok: false, message: "Escreva o texto da saudação." };
  if (greetingEnabled && greetingFormat === "audio" && !greetingAudioPath) return { ok: false, message: "Grave ou escolha o áudio da saudação." };
  if (awayEnabled && !awayText) return { ok: false, message: "Escreva o texto para fora do horário." };
  if (greetingText.length > 4096 || awayText.length > 4096) return { ok: false, message: "Texto longo demais." };

  const parsed = parseBusinessHours(get);
  if (!parsed.ok) return parsed;
  const businessHours = parsed.hours;
  if (awayEnabled && Object.keys(businessHours).length === 0) {
    return { ok: false, message: "Marque ao menos um dia de atendimento." };
  }
  return { ok: true, settings: { greetingEnabled, greetingFormat, greetingText, greetingAudioPath, awayEnabled, awayText, businessHours } };
}

export interface AutoReplyContext {
  organizationId: string;
  accountId: string;
  conversationId: string;
  accountActive: boolean;
  isFirstMessage: boolean;
  greetedAt: string | null;
  lastAwayReplyAt: string | null;
  lastOutboundAt: string | null;
  settings: AutoReplySettings;
  /** The AI attendant is on: it answers, so only the greeting goes out. */
  agentOn?: boolean;
}

/** What sending an automatic message needs to know. */
export type SendTarget = Pick<AutoReplyContext, "organizationId" | "accountId" | "conversationId" | "lastOutboundAt">;

export interface AutoReplyStore {
  /** Null when the message is unknown or the business has nothing enabled. */
  loadContext(accountExternalId: string, externalMessageId: string): Promise<AutoReplyContext | null>;
  countRecent(organizationId: string, since: Date): Promise<number>;
  /** Atomically takes the right to send. False when another run already did. */
  claim(conversationId: string, kind: AutoReplyKind, now: Date): Promise<boolean>;
  createPending(context: SendTarget, message: PendingMessage, now: Date): Promise<string>;
  /** A temporary address the provider downloads a stored file from. Null when it is gone. */
  fileUrl(organizationId: string, path: string): Promise<string | null>;
  markFailed(messageId: string, errorCode: string): Promise<void>;
  markSent(context: SendTarget, messageId: string, externalMessageId: string, now: Date): Promise<void>;
}

export type AutoReplyOutcome = "sent" | "failed" | "hourly_limit";

export type PendingMessage = { type: "text"; body: string } | { type: "audio"; mediaPath: string; mimeType: string };

/** Voice notes are stored as Ogg Opus: WhatsApp shows them as recorded on the spot. */
export const VOICE_NOTE_MIME = "audio/ogg";

async function replyTo(
  event: NormalizedMessageEvent,
  provider: Pick<ChannelProvider, "sendMessage" | "sendMedia">,
  store: AutoReplyStore,
  now: Date,
): Promise<AutoReplyOutcome | null> {
  const context = await store.loadContext(event.accountExternalId, event.externalMessageId);
  if (!context?.accountActive) return null;

  const decision = decideAutoReply({ ...context, now });
  if (!decision) return null;

  const since = new Date(now.getTime() - 3_600_000);
  if ((await store.countRecent(context.organizationId, since)) >= MAX_AUTO_REPLIES_PER_HOUR) return "hourly_limit";
  if (!(await store.claim(context.conversationId, decision.kind, now))) return null;

  const audioUrl = decision.audioPath && provider.sendMedia ? await store.fileUrl(context.organizationId, decision.audioPath) : null;
  if (!audioUrl && !decision.body) return null;
  const target = { channel: event.channel, accountExternalId: event.accountExternalId, to: event.contact.externalId };

  let messageId: string;
  let result;
  if (audioUrl && decision.audioPath && provider.sendMedia) {
    messageId = await store.createPending(context, { type: "audio", mediaPath: decision.audioPath, mimeType: VOICE_NOTE_MIME }, now);
    result = await provider.sendMedia({ ...target, url: audioUrl, mimeType: VOICE_NOTE_MIME, idempotencyKey: messageId });
  } else {
    messageId = await store.createPending(context, { type: "text", body: decision.body }, now);
    result = await provider.sendMessage({ ...target, type: "text", body: decision.body, idempotencyKey: messageId });
  }
  if (!result.ok) {
    await store.markFailed(messageId, result.errorCode);
    return "failed";
  }
  await store.markSent(context, messageId, result.externalMessageId, now);
  return "sent";
}

/**
 * Answers the new customer messages of a webhook delivery. Replies sent from the
 * phone, imported history and the echo of our own sends never trigger it, so it
 * cannot answer itself. One failure does not stop the others or the webhook.
 */
export async function runAutoReplies(
  events: NormalizedEvent[],
  provider: Pick<ChannelProvider, "sendMessage" | "sendMedia">,
  store: AutoReplyStore,
  options: { now?: Date; onError?: (error: unknown) => void; onOutcome?: (outcome: AutoReplyOutcome) => void } = {},
): Promise<void> {
  const now = options.now ?? new Date();
  for (const event of events) {
    if (event.kind !== "message" || event.direction !== "inbound" || event.origin !== "customer") continue;
    if (now.getTime() - event.occurredAt.getTime() > MAX_MESSAGE_AGE_MS) continue;
    try {
      const outcome = await replyTo(event, provider, store, now);
      if (outcome) options.onOutcome?.(outcome);
    } catch (error) {
      options.onError?.(error);
    }
  }
}
