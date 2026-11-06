/**
 * ChatPro webhook parser (https://chatpro.readme.io). Pure and defensive.
 *
 * ChatPro payloads do not identify the instance in the "CHATPRO API" format,
 * so the route wraps every delivery as { instanceId, event } using the
 * instance from the webhook URL.
 *
 * Accepted event shapes, as documented:
 * - Messages: { Type: "send_message" | "send_image_message" | ..., IsSync,
 *   Body: { Info: { Id, RemoteJid, FromMe, Timestamp, PushName, Source }, Text, Caption }, Url, FileType }.
 *   The docs only show FromMe=true samples; FromMe=false is handled as received.
 * - Delivery status: ["Msg", { cmd: "ack", id, ack, t, isSync }].
 * - "API DO CHAT" received/sent: { event, event_ts, message_data: { id, number, from_me, message, url, file_type, ts_receive } }.
 *
 * Groups and broadcasts are ignored: the inbox only handles 1:1 conversations.
 */
import { normalizePhone } from "../phone";
import type { DeliveryStatus, MessageType, NormalizedContact, NormalizedEvent, NormalizedMessageEvent } from "../types";

type Obj = Record<string, unknown>;

export interface ChatProEnvelope {
  instanceId: string;
  event: unknown;
}

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const httpsUrl = (v: unknown): string | null => {
  const s = str(v);
  return s && s.startsWith("https://") ? s : null;
};

/** "5511...@s.whatsapp.net" -> contact; groups, broadcasts and malformed ids -> null. */
export function contactFromJid(jid: unknown, profileName: string | null): NormalizedContact | null {
  const value = str(jid);
  if (!value) return null;
  const [userPart, domain] = value.split("@");
  if (!userPart || !domain) return null;
  const user = userPart.split(":")[0]!;
  if (!/^\d+$/.test(user)) return null;
  if (domain === "s.whatsapp.net" || domain === "c.us") {
    return { externalId: user, phoneNormalized: normalizePhone(user), profileName };
  }
  // Privacy ids carry no phone number but still identify the person.
  if (domain === "lid") return { externalId: user, phoneNormalized: null, profileName };
  return null;
}

/** Epoch seconds (number or numeric string) or an ISO date. */
function toDate(v: unknown): Date | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return new Date(v * 1000);
  if (typeof v === "string" && v) {
    const seconds = Number(v);
    const date = Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date(v);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

const TYPE_BY_EVENT: Record<string, MessageType> = {
  send_message: "text",
  send_image_message: "image",
  send_audio_message: "audio",
  send_video_message: "video",
  send_document_message: "document",
};
const TYPE_BY_MESSAGE_KEY: Record<string, MessageType> = {
  conversation: "text",
  extendedTextMessage: "text",
  imageMessage: "image",
  audioMessage: "audio",
  videoMessage: "video",
  documentMessage: "document",
  stickerMessage: "sticker",
  locationMessage: "location",
  contactMessage: "contacts",
  reactionMessage: "reaction",
};

function typeFromMime(mime: string | null): MessageType | null {
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

function parseApiMessage(root: Obj, instanceId: string): NormalizedEvent[] {
  const body = isObj(root.Body) ? root.Body : {};
  const info = isObj(body.Info) ? body.Info : isObj(root.Info) ? root.Info : null;
  if (!info) return [];

  const externalMessageId = str(info.Id);
  const occurredAt = toDate(info.Timestamp);
  const fromMe = info.FromMe === true;
  const contact = contactFromJid(info.RemoteJid, fromMe ? null : str(info.PushName));
  if (!externalMessageId || !occurredAt || !contact) return [];

  const source = isObj(info.Source) ? info.Source : {};
  const message = isObj(source.message) ? source.message : {};
  const messageKey = Object.keys(message).find((k) => k in TYPE_BY_MESSAGE_KEY);
  const inner = messageKey && isObj(message[messageKey]) ? (message[messageKey] as Obj) : {};

  const type: MessageType =
    TYPE_BY_EVENT[str(root.Type) ?? ""] ?? (messageKey ? TYPE_BY_MESSAGE_KEY[messageKey]! : "unsupported");
  const text =
    str(body.Text) ?? str(message.conversation) ?? str(inner.text) ?? str(body.Caption) ?? str(inner.caption) ?? null;
  const isMedia = type === "image" || type === "audio" || type === "video" || type === "document";

  const event: NormalizedMessageEvent = {
    kind: "message",
    channel: "whatsapp",
    accountExternalId: instanceId,
    direction: fromMe ? "outbound" : "inbound",
    // Replies from the phone and from this app both arrive with FromMe=true.
    origin: fromMe ? "business_app_echo" : root.IsSync === true ? "history" : "customer",
    contact,
    externalMessageId,
    type,
    body: text,
    mediaExternalId: isMedia ? (httpsUrl(root.Url) ?? httpsUrl(inner.url)) : null,
    mediaMimeType: isMedia ? (str(root.FileType) ?? str(inner.mimetype)) : null,
    occurredAt,
  };
  return [event];
}

const ACK_STATUS: Record<number, DeliveryStatus> = { 1: "sent", 2: "delivered", 3: "read", 4: "read" };

function parseAck(data: Obj, instanceId: string): NormalizedEvent[] {
  const externalMessageId = str(data.id);
  const status = typeof data.ack === "number" ? ACK_STATUS[data.ack] : undefined;
  const occurredAt = toDate(data.t) ?? new Date(0);
  if (!externalMessageId || !status) return [];
  return [
    {
      kind: "status",
      channel: "whatsapp",
      accountExternalId: instanceId,
      externalMessageId,
      status,
      occurredAt,
      errorCode: null,
    },
  ];
}

/**
 * ChatPro Chat names message kinds in `type` (receveid_image_message, video_preview...,
 * spelled as ChatPro sends it). Session bookkeeping rows are not messages: null.
 */
function chatMessageType(data: Obj, url: string | null, mime: string | null): MessageType | null {
  const kind = str(data.type) ?? "";
  if (kind.includes("session")) return null;
  if (kind.includes("image")) return "image";
  if (kind.includes("audio")) return "audio";
  if (kind.includes("video")) return "video";
  if (kind.includes("document")) return "document";
  if (kind.includes("vcard")) return "contacts";
  return (url ? typeFromMime(mime) : null) ?? "text";
}

function chatMessageEvent(
  data: Obj,
  instanceId: string,
  history: { profileName: string | null } | null,
): NormalizedMessageEvent | null {
  const externalMessageId = str(data.id);
  const occurredAt = toDate(data.ts_receive);
  const fromMe = data.from_me === true;
  const contact = contactFromJid(data.number, history?.profileName ?? null);
  if (!externalMessageId || !occurredAt || !contact) return null;
  if (data.ignore === true || data.delete_message === true || str(data.deleted_at)) return null;

  const mime = str(data.file_type);
  const url = httpsUrl(data.url);
  const type = chatMessageType(data, url, mime);
  if (!type) return null;
  const isMedia = type === "image" || type === "audio" || type === "video" || type === "document";
  const body = str(data.message);
  if (type === "text" && !body) return null;

  return {
    kind: "message",
    channel: "whatsapp",
    accountExternalId: instanceId,
    direction: fromMe ? "outbound" : "inbound",
    // History must not count as unread or pretend it just arrived.
    origin: history ? "history" : fromMe ? "business_app_echo" : "customer",
    contact,
    externalMessageId,
    type,
    body,
    mediaExternalId: isMedia ? url : null,
    mediaMimeType: isMedia ? mime : null,
    occurredAt,
  };
}

function parseChatMessage(data: Obj, instanceId: string): NormalizedEvent[] {
  const event = chatMessageEvent(data, instanceId, null);
  return event ? [event] : [];
}

/** Messages from ChatPro Chat's messages/getAll, as history. Same fields as the webhook. */
export function parseChatProHistory(
  messages: unknown[],
  instanceId: string,
  profileName: string | null,
): NormalizedMessageEvent[] {
  return messages
    .filter(isObj)
    .map((m) => chatMessageEvent(m, instanceId, { profileName }))
    .filter((e): e is NormalizedMessageEvent => e !== null);
}

export function parseChatProWebhook(payload: unknown): NormalizedEvent[] {
  if (!isObj(payload)) return [];
  const instanceId = str(payload.instanceId);
  const event = payload.event;
  if (!instanceId) return [];

  if (Array.isArray(event)) {
    const data = event.find(isObj);
    return data && data.cmd === "ack" ? parseAck(data, instanceId) : [];
  }
  if (!isObj(event)) return [];
  if (isObj(event.message_data)) {
    return event.event === "received_message" || event.event === "sent_message"
      ? parseChatMessage(event.message_data, instanceId)
      : [];
  }
  if (event.cmd === "ack") return parseAck(event, instanceId);
  return parseApiMessage(event, instanceId);
}
