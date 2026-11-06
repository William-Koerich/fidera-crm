/**
 * ChatPro provider (WHATSAPP_PROVIDER=chatpro). Docs: https://chatpro.readme.io,
 * read on 2026-11-06. It uses two ChatPro services, each with its own key:
 *
 * Connection: https://oci.chatpro.com.br/{instance_id}/api/v1, header Authorization.
 * - status: GET -> { connected, info: { Wid, Pushname } }.
 * - generate_qrcode: GET -> { qr (base64), status, error }.
 * - remove_session: GET -> disconnects the phone.
 * - get_profile: POST { number } -> { name, pushname, imgUrl }. 400 for unknown numbers;
 *   200 with no fields when the session holds nothing about the person.
 *
 * Messages (ChatPro Chat): https://sparks.chatpro.com.br, header instance-token.
 * - sessions/getOrCreateByNumber: POST { instanceId, number, provider } -> { id, ... }.
 * - messages/sendMessage: POST { instanceId, sessionId, message, provider }. ChatPro
 *   support pointed to this route; the public docs omit it and the send_message they
 *   list belongs to the bulk-sending API. Its success body was not documented, hence
 *   the tolerant id lookup below.
 * - messages/sendFileFromUrl: POST { instanceId, sessionId, url, provider, caption }.
 *
 * The number is linked by QR Code and is not on Meta's Cloud API, so there is
 * no 24h reply window here.
 */
import type {
  ChannelProvider,
  ContactProfile,
  DownloadedMedia,
  NormalizedEvent,
  ReplyWindow,
  SendMediaInput,
  SendMessageInput,
  SendResult,
} from "../types";
import { parseChatProWebhook } from "./parse";

export const CHATPRO_API_URL = "https://oci.chatpro.com.br";
export const CHATPRO_CHAT_URL = "https://sparks.chatpro.com.br";

export interface ChatProOptions {
  /** Key for connection calls (status, QR Code, disconnect). */
  token: string;
  /** Key for ChatPro Chat calls (sending messages). */
  chatToken: string;
  baseUrl?: string;
  chatBaseUrl?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

export interface ChatProStatus {
  connected: boolean;
  /** Connected WhatsApp id, when the API reports one. */
  wid: string | null;
}

const PAGE_SIZE = 100;
const MAX_SESSIONS = 1_000;
const MAX_MESSAGE_OFFSET = 100;
const MAX_PHONE_DIGITS = 15;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** ChatPro Chat answered 429. It sends no Retry-After, so callers wait and try again. */
export class ChatProRateLimitError extends Error {
  constructor() {
    super("ChatPro rate limit");
    this.name = "ChatProRateLimitError";
  }
}

export interface ChatProSession {
  id: string;
  leadId: string | null;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** The id at the top of the body or under one of the usual wrappers. */
function findId(body: Json): string | null {
  const nested = [body.message, body.data, body.session, body.key, body.resposeMessage, body.responseMessage];
  return text(body.id) ?? text(body.messageId) ?? text(body.message_id) ?? nested.map((n) => (isObj(n) ? text(n.id) : null)).find(Boolean) ?? null;
}

const sendError = (status: number, body: Json): SendResult => ({
  ok: false,
  errorCode: status === 401 ? "chatpro_unauthorized" : `http_${status}`,
  // May echo the phone number; callers keep it out of logs.
  errorMessage: (Array.isArray(body.message) ? body.message.join("; ") : text(body.message)) ?? `HTTP ${status}`,
  retryable: status >= 500 || status === 429,
});

export class ChatProChannelProvider implements ChannelProvider {
  readonly name = "chatpro" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly chatBaseUrl: string;
  private readonly now: () => Date;

  constructor(private readonly options: ChatProOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.baseUrl = (options.baseUrl ?? CHATPRO_API_URL).replace(/\/$/, "");
    this.chatBaseUrl = (options.chatBaseUrl ?? CHATPRO_CHAT_URL).replace(/\/$/, "");
    this.now = options.now ?? (() => new Date());
  }

  parseWebhook(payload: unknown): NormalizedEvent[] {
    return parseChatProWebhook(payload);
  }

  getReplyWindow(): ReplyWindow {
    return { isOpen: true, endsAt: null, remainingMs: Number.POSITIVE_INFINITY, humanAgentEndsAt: null };
  }

  private url(instanceId: string, action: string): string {
    return `${this.baseUrl}/${encodeURIComponent(instanceId)}/api/v1/${action}`;
  }

  private call(instanceId: string, action: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(this.url(instanceId, action), {
      ...init,
      headers: { Authorization: this.options.token, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
  }

  async sendMessage(input: SendMessageInput): Promise<SendResult> {
    if (input.channel !== "whatsapp") {
      return { ok: false, errorCode: "unsupported_channel", errorMessage: "Only WhatsApp is supported", retryable: false };
    }
    return this.sendInSession(input.accountExternalId, input.to, input.idempotencyKey, (sessionId) => [
      "messages/sendMessage",
      { sessionId, message: input.body },
    ]);
  }

  async sendMedia(input: SendMediaInput): Promise<SendResult> {
    if (input.channel !== "whatsapp") {
      return { ok: false, errorCode: "unsupported_channel", errorMessage: "Only WhatsApp is supported", retryable: false };
    }
    return this.sendInSession(input.accountExternalId, input.to, input.idempotencyKey, (sessionId) => [
      "messages/sendFileFromUrl",
      { sessionId, url: input.url, ...(input.caption ? { caption: input.caption } : {}) },
    ]);
  }

  /** ChatPro Chat sends inside a session: finds or opens the person's, then sends. */
  private async sendInSession(
    instanceId: string,
    to: string,
    idempotencyKey: string | undefined,
    request: (sessionId: string) => [path: string, fields: Json],
  ): Promise<SendResult> {
    if (!this.options.chatToken) {
      return { ok: false, errorCode: "chatpro_chat_not_configured", errorMessage: "Missing CHATPRO_CHAT_TOKEN", retryable: false };
    }
    try {
      const session = await this.chat("sessions/getOrCreateByNumber", { instanceId, number: to, provider: "whatsapp" });
      if (!session.ok) return sendError(session.status, session.body);
      const sessionId = findId(session.body);
      if (!sessionId) {
        return { ok: false, errorCode: "chatpro_no_session", errorMessage: "ChatPro returned no session", retryable: false };
      }

      const [path, fields] = request(sessionId);
      const sent = await this.chat(path, { instanceId, provider: "whatsapp", ...fields });
      if (!sent.ok) return sendError(sent.status, sent.body);
      // ChatPro accepted it: reporting a failure here would invite a duplicate resend.
      const id = findId(sent.body) ?? `chatpro-local-${idempotencyKey ?? crypto.randomUUID()}`;
      return { ok: true, externalMessageId: id, acceptedAt: this.now() };
    } catch (error) {
      const timeout = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false,
        errorCode: timeout ? "timeout" : "network_error",
        errorMessage: timeout ? "ChatPro API timed out" : "Could not reach ChatPro API",
        retryable: true,
      };
    }
  }

  private async chat(path: string, payload: Json): Promise<{ ok: boolean; status: number; body: Json }> {
    const { ok, status, data } = await this.chatJson(path, payload);
    return { ok, status, body: isObj(data) ? data : {} };
  }

  private async chatJson(path: string, payload: Json): Promise<{ ok: boolean; status: number; data: unknown }> {
    const response = await this.fetchImpl(`${this.chatBaseUrl}/${path}`, {
      method: "POST",
      headers: { "instance-token": this.options.chatToken, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
  }

  /** Read call that returns a list, one page. */
  private async chatPage(path: string, payload: Json): Promise<unknown[]> {
    const { ok, status, data } = await this.chatJson(path, payload);
    if (status === 429) throw new ChatProRateLimitError();
    if (!ok || !Array.isArray(data)) throw new Error(`ChatPro ${path} failed (${status})`);
    return data;
  }

  /** 1:1 WhatsApp conversations ChatPro Chat holds for this instance. */
  async listSessions(instanceId: string): Promise<ChatProSession[]> {
    const sessions: ChatProSession[] = [];
    for (let offset = 0; offset < MAX_SESSIONS; offset += PAGE_SIZE) {
      const page = await this.chatPage("sessions/list", { instanceId, limit: PAGE_SIZE, offset });
      for (const s of page) {
        const id = isObj(s) ? text(s.id) : null;
        if (id && isObj(s) && s.group !== true && s.provider === "whatsapp") {
          sessions.push({ id, leadId: text(s.lead_id) });
        }
      }
      if (page.length < PAGE_SIZE) break;
    }
    return sessions;
  }

  /** Latest messages of a session, newest first. ChatPro documents an offset of at most 100. */
  async getSessionMessages(instanceId: string, sessionId: string): Promise<unknown[]> {
    const messages: unknown[] = [];
    for (let offset = 0; offset <= MAX_MESSAGE_OFFSET; offset += PAGE_SIZE) {
      const page = await this.chatPage("messages/getAll", { instanceId, sessionId, limit: PAGE_SIZE, offset });
      messages.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return messages;
  }

  /** Name of a contact, when ChatPro knows one. A missing name never blocks an import. */
  async getLeadName(instanceId: string, leadId: string): Promise<string | null> {
    const { status, data } = await this.chatJson("leads/findById", { instanceId, leadId });
    if (status === 429) throw new ChatProRateLimitError();
    if (!isObj(data)) return null;
    return text(data.nome_personalizado) ?? text(data.contact_name) ?? text(data.name) ?? text(data.push_name);
  }

  async getStatus(instanceId: string): Promise<ChatProStatus> {
    const response = await this.call(instanceId, "status");
    if (!response.ok) throw new Error(`ChatPro status failed (${response.status})`);
    const json = (await response.json().catch(() => ({}))) as { connected?: boolean; info?: { Wid?: string } };
    return { connected: json.connected === true, wid: json.info?.Wid ?? null };
  }

  /** QR Code as an image data URL, ready for an <img>. */
  async getQrCode(instanceId: string): Promise<string> {
    const response = await this.call(instanceId, "generate_qrcode");
    if (!response.ok) throw new Error(`ChatPro QR Code failed (${response.status})`);
    const json = (await response.json().catch(() => ({}))) as { qr?: string };
    if (!json.qr) throw new Error("ChatPro returned no QR Code");
    return json.qr.startsWith("data:") ? json.qr : `data:image/png;base64,${json.qr}`;
  }

  async disconnect(instanceId: string): Promise<void> {
    const response = await this.call(instanceId, "remove_session");
    if (!response.ok) throw new Error(`ChatPro disconnect failed (${response.status})`);
  }

  /**
   * Name and photo of a person. get_profile knows what the connected phone knows;
   * the ChatPro Chat lead fills in what is missing. Privacy ids (no real number) are
   * unknown to both.
   */
  async getContactProfile(instanceId: string, externalId: string): Promise<ContactProfile | null> {
    if (externalId.length > MAX_PHONE_DIGITS) return null;

    const response = await this.call(instanceId, "get_profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: externalId }),
    });
    if (response.status === 429) throw new ChatProRateLimitError();
    const body: unknown = response.ok ? await response.json().catch(() => ({})) : {};
    const profile = isObj(body) ? body : {};
    const savedName = text(profile.name);
    const publicName = text(profile.pushname) ?? text(profile.verifiedName);
    const imageUrl = text(profile.imgUrl) ?? text(profile.eurl);
    if (savedName && imageUrl) return { savedName, publicName, imageUrl };

    const lead = this.options.chatToken
      ? await this.chatJson("leads/findByPhoneNumber", { instanceId, phoneNumber: externalId })
      : null;
    if (lead?.status === 429) throw new ChatProRateLimitError();
    const found = lead?.ok && isObj(lead.data) ? lead.data : {};
    const merged = {
      savedName: savedName ?? text(found.nome_personalizado) ?? text(found.contact_name),
      publicName: publicName ?? text(found.name) ?? text(found.push_name),
      imageUrl: imageUrl ?? text(found.eul),
    };
    return response.ok || lead?.ok ? merged : null;
  }

  /** Only WhatsApp's own image host: the address comes from a third party's response. */
  async downloadContactPhoto(url: string): Promise<DownloadedMedia> {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:" || !hostname.endsWith(".whatsapp.net")) throw new Error("Refusing photo from an unexpected host");
    const file = await this.fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!file.ok) throw new Error(`photo download failed (${file.status})`);
    const mimeType = file.headers.get("content-type") ?? "";
    if (!mimeType.startsWith("image/")) throw new Error("Photo is not an image");
    const data = await file.arrayBuffer();
    if (data.byteLength > MAX_PHOTO_BYTES) throw new Error("Photo is too large");
    return { data, mimeType };
  }

  /** Webhooks carry a direct file URL as the media id. The instance token is not sent to that host. */
  async downloadMedia(input: { accountExternalId: string; mediaId: string }): Promise<DownloadedMedia> {
    if (!input.mediaId.startsWith("https://")) throw new Error("Refusing non-https media URL");
    const file = await this.fetchImpl(input.mediaId, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!file.ok) throw new Error(`media download failed (${file.status})`);
    return {
      data: await file.arrayBuffer(),
      mimeType: file.headers.get("content-type") ?? "application/octet-stream",
    };
  }
}
