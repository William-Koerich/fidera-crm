export type Channel = "whatsapp" | "instagram";

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "reaction"
  | "template"
  | "interactive"
  | "unsupported";

export type MessageOrigin = "customer" | "business_app_echo" | "history";
export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface NormalizedContact {
  /** Identifier exactly as the channel sends it (wa_id, IGSID...). */
  externalId: string;
  /** Canonical phone digits, or null when the channel has no phone. */
  phoneNormalized: string | null;
  profileName: string | null;
}

export interface NormalizedMessageEvent {
  kind: "message";
  channel: Channel;
  /** WhatsApp phone_number_id / Instagram account id that received or sent it. */
  accountExternalId: string;
  direction: "inbound" | "outbound";
  origin: MessageOrigin;
  contact: NormalizedContact;
  externalMessageId: string;
  type: MessageType;
  body: string | null;
  mediaExternalId: string | null;
  mediaMimeType: string | null;
  occurredAt: Date;
}

export interface NormalizedStatusEvent {
  kind: "status";
  channel: Channel;
  accountExternalId: string;
  externalMessageId: string;
  status: DeliveryStatus;
  occurredAt: Date;
  errorCode: string | null;
}

export interface NormalizedHistoryProgressEvent {
  kind: "history_progress";
  channel: "whatsapp";
  accountExternalId: string;
  phase: number;
  chunkOrder: number;
  progress: number;
}

export interface NormalizedContactSyncEvent {
  kind: "contact_sync";
  channel: "whatsapp";
  accountExternalId: string;
  action: "add" | "remove";
  contact: NormalizedContact;
  occurredAt: Date;
}

export interface NormalizedAccountUpdateEvent {
  kind: "account_update";
  channel: "whatsapp";
  /** WhatsApp Business Account id. */
  businessExternalId: string | null;
  event: string;
  reason: string | null;
  initiatedBy: string | null;
}

export interface UnsupportedEvent {
  kind: "unsupported";
  channel: Channel;
  field: string;
}

export type NormalizedEvent =
  | NormalizedMessageEvent
  | NormalizedStatusEvent
  | NormalizedHistoryProgressEvent
  | NormalizedContactSyncEvent
  | NormalizedAccountUpdateEvent
  | UnsupportedEvent;

export interface SendMessageInput {
  channel: Channel;
  accountExternalId: string;
  /** Contact identifier on the channel (wa_id, IGSID). */
  to: string;
  type: "text";
  body: string;
}

export type SendResult =
  | { ok: true; externalMessageId: string; acceptedAt: Date }
  | { ok: false; errorCode: string; errorMessage: string; retryable: boolean };

/** Only what is needed to compute the reply window. */
export interface ReplyWindowConversation {
  channel: Channel;
  lastInboundAt: Date | null;
}

export interface ReplyWindow {
  /** Free-form replies allowed now. */
  isOpen: boolean;
  /** End of the standard window, or null when there was no inbound message. */
  endsAt: Date | null;
  remainingMs: number;
  /** Instagram only: end of the Human Agent extension, when approved. */
  humanAgentEndsAt: Date | null;
}

export interface ChannelProvider {
  readonly name: "mock" | "meta";
  parseWebhook(payload: unknown): NormalizedEvent[];
  sendMessage(input: SendMessageInput): Promise<SendResult>;
  getReplyWindow(conversation: ReplyWindowConversation, now?: Date): ReplyWindow;
}
