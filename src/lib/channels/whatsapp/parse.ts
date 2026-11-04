/**
 * Parser for WhatsApp Cloud API webhook payloads (object
 * "whatsapp_business_account"). Pure and defensive: unknown shapes become
 * "unsupported" events instead of throwing. Shared by the mock and Meta
 * providers.
 *
 * Fields handled: messages (messages + statuses), smb_message_echoes,
 * history, smb_app_state_sync, account_update.
 */
import { normalizePhone } from "../phone";
import type {
  DeliveryStatus,
  MessageType,
  NormalizedContact,
  NormalizedEvent,
  NormalizedMessageEvent,
} from "../types";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objs = (v: unknown): Obj[] => arr(v).filter(isObj);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : typeof v === "number" ? String(v) : null;
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** WhatsApp timestamps are unix seconds as strings. */
function toDate(v: unknown): Date | null {
  const n = num(v);
  return n === null ? null : new Date(n * 1000);
}

const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);
const KNOWN_TYPES: ReadonlySet<string> = new Set<MessageType>([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contacts",
  "reaction",
  "template",
  "interactive",
]);

function mapType(type: string | null): MessageType {
  if (type === "button") return "interactive";
  return type && KNOWN_TYPES.has(type) ? (type as MessageType) : "unsupported";
}

function contactFrom(externalId: string, profileName: string | null): NormalizedContact {
  return { externalId, phoneNormalized: normalizePhone(externalId), profileName };
}

/** Extracts body / media from a message object whose content key equals its type. */
function content(msg: Obj): Pick<NormalizedMessageEvent, "type" | "body" | "mediaExternalId" | "mediaMimeType"> {
  const rawType = str(msg.type);
  const type = mapType(rawType);
  const inner = rawType && isObj(msg[rawType]) ? (msg[rawType] as Obj) : {};

  let body: string | null = null;
  if (rawType === "text") body = str(inner.body);
  else if (rawType === "reaction") body = str(inner.emoji);
  else if (rawType === "button") body = str(inner.text);
  else if (rawType === "interactive") {
    const reply = isObj(inner.button_reply) ? inner.button_reply : isObj(inner.list_reply) ? inner.list_reply : {};
    body = str(reply.title);
  } else if (rawType === "location") {
    body = [str(inner.name), str(inner.address)].filter(Boolean).join(" - ") || null;
  } else if (rawType && MEDIA_TYPES.has(rawType)) body = str(inner.caption);

  const isMedia = rawType !== null && MEDIA_TYPES.has(rawType);
  return {
    type,
    body,
    mediaExternalId: isMedia ? str(inner.id) : null,
    mediaMimeType: isMedia ? str(inner.mime_type) : null,
  };
}

function messageEvent(
  msg: Obj,
  base: { accountExternalId: string; direction: "inbound" | "outbound"; origin: NormalizedMessageEvent["origin"] },
  contact: NormalizedContact,
): NormalizedMessageEvent | null {
  const externalMessageId = str(msg.id);
  const occurredAt = toDate(msg.timestamp);
  if (!externalMessageId || !occurredAt) return null;
  return { kind: "message", channel: "whatsapp", ...base, contact, externalMessageId, occurredAt, ...content(msg) };
}

const STATUS_MAP: Record<string, DeliveryStatus> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

function parseMessagesField(value: Obj, accountExternalId: string): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  const names = new Map<string, string | null>();
  for (const c of objs(value.contacts)) {
    const waId = str(c.wa_id);
    if (waId) names.set(waId, isObj(c.profile) ? str(c.profile.name) : null);
  }

  for (const msg of objs(value.messages)) {
    const from = str(msg.from);
    if (!from) continue;
    const ev = messageEvent(
      msg,
      { accountExternalId, direction: "inbound", origin: "customer" },
      contactFrom(from, names.get(from) ?? null),
    );
    if (ev) events.push(ev);
  }

  for (const st of objs(value.statuses)) {
    const externalMessageId = str(st.id);
    const status = STATUS_MAP[str(st.status) ?? ""];
    const occurredAt = toDate(st.timestamp);
    if (!externalMessageId || !status || !occurredAt) continue;
    const firstError = objs(st.errors)[0];
    events.push({
      kind: "status",
      channel: "whatsapp",
      accountExternalId,
      externalMessageId,
      status,
      occurredAt,
      errorCode: firstError ? str(firstError.code) : null,
    });
  }
  return events;
}

function parseEchoes(value: Obj, accountExternalId: string): NormalizedEvent[] {
  return objs(value.message_echoes).flatMap((msg) => {
    const to = str(msg.to);
    if (!to) return [];
    const ev = messageEvent(
      msg,
      { accountExternalId, direction: "outbound", origin: "business_app_echo" },
      contactFrom(to, null),
    );
    return ev ? [ev] : [];
  });
}

function parseHistory(value: Obj, accountExternalId: string, businessPhone: string | null): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  for (const chunk of objs(value.history)) {
    const meta = isObj(chunk.metadata) ? chunk.metadata : null;
    if (meta) {
      events.push({
        kind: "history_progress",
        channel: "whatsapp",
        accountExternalId,
        phase: num(meta.phase) ?? 0,
        chunkOrder: num(meta.chunk_order) ?? 0,
        progress: num(meta.progress) ?? 0,
      });
    }
    for (const thread of objs(chunk.threads)) {
      const userId = str(thread.id);
      if (!userId) continue;
      const contact = contactFrom(userId, null);
      for (const msg of objs(thread.messages)) {
        // Messages from the business carry "to"; customer messages come "from" the user.
        const fromBusiness =
          str(msg.to) !== null || (businessPhone !== null && normalizePhone(str(msg.from)) === businessPhone);
        const ev = messageEvent(
          msg,
          { accountExternalId, direction: fromBusiness ? "outbound" : "inbound", origin: "history" },
          contact,
        );
        if (ev) events.push(ev);
      }
    }
  }
  return events;
}

function parseStateSync(value: Obj, accountExternalId: string): NormalizedEvent[] {
  return objs(value.state_sync).flatMap((item): NormalizedEvent[] => {
    if (str(item.type) !== "contact" || !isObj(item.contact)) return [];
    const phone = str(item.contact.phone_number);
    const action = str(item.action);
    if (!phone || (action !== "add" && action !== "remove")) return [];
    const meta = isObj(item.metadata) ? item.metadata : {};
    return [
      {
        kind: "contact_sync",
        channel: "whatsapp",
        accountExternalId,
        action,
        contact: contactFrom(phone, str(item.contact.full_name) ?? str(item.contact.first_name)),
        occurredAt: toDate(meta.timestamp) ?? new Date(0),
      },
    ];
  });
}

function parseAccountUpdate(value: Obj): NormalizedEvent[] {
  const event = str(value.event);
  if (!event) return [];
  const waba = isObj(value.waba_info) ? value.waba_info : {};
  const disc = isObj(value.disconnection_info) ? value.disconnection_info : {};
  return [
    {
      kind: "account_update",
      channel: "whatsapp",
      businessExternalId: str(waba.waba_id),
      event,
      reason: str(disc.reason),
      initiatedBy: str(disc.initiated_by),
    },
  ];
}

export function parseWhatsAppWebhook(payload: unknown): NormalizedEvent[] {
  if (!isObj(payload) || payload.object !== "whatsapp_business_account") return [];

  const events: NormalizedEvent[] = [];
  for (const entry of objs(payload.entry)) {
    for (const change of objs(entry.changes)) {
      const field = str(change.field) ?? "unknown";
      const value = isObj(change.value) ? change.value : {};
      const metadata = isObj(value.metadata) ? value.metadata : {};
      const accountExternalId = str(metadata.phone_number_id) ?? "";
      const businessPhone = normalizePhone(str(metadata.display_phone_number));

      switch (field) {
        case "messages":
          events.push(...parseMessagesField(value, accountExternalId));
          break;
        case "smb_message_echoes":
          events.push(...parseEchoes(value, accountExternalId));
          break;
        case "history":
          events.push(...parseHistory(value, accountExternalId, businessPhone));
          break;
        case "smb_app_state_sync":
          events.push(...parseStateSync(value, accountExternalId));
          break;
        case "account_update":
          events.push(...parseAccountUpdate(value));
          break;
        default:
          events.push({ kind: "unsupported", channel: "whatsapp", field });
      }
    }
  }
  return events;
}
