/**
 * ChatPro provider (WHATSAPP_PROVIDER=chatpro), "CHATPRO API" product.
 * Docs: https://chatpro.readme.io, read on 2026-11-06.
 *
 * - Base https://v5.chatpro.com.br/{instance_id}/api/v1, header Authorization: <instance token>.
 * - send_message: POST { number, message } -> 201 { resposeMessage: { id, timestamp }, status: true }.
 * - status: GET -> { connected, info: { Wid, Pushname } }.
 * - generate_qrcode: GET -> { qr (base64), status, error }.
 * - remove_session: GET -> disconnects the phone.
 *
 * The number is linked by QR Code and is not on Meta's Cloud API, so there is
 * no 24h reply window here.
 */
import type {
  ChannelProvider,
  DownloadedMedia,
  NormalizedEvent,
  ReplyWindow,
  SendMessageInput,
  SendResult,
} from "../types";
import { parseChatProWebhook } from "./parse";

export const CHATPRO_API_URL = "https://v5.chatpro.com.br";

export interface ChatProOptions {
  /** Instance token from the ChatPro panel. */
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

export interface ChatProStatus {
  connected: boolean;
  /** Connected WhatsApp id, when the API reports one. */
  wid: string | null;
}

export class ChatProChannelProvider implements ChannelProvider {
  readonly name = "chatpro" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly now: () => Date;

  constructor(private readonly options: ChatProOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.baseUrl = (options.baseUrl ?? CHATPRO_API_URL).replace(/\/$/, "");
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
    let response: Response;
    try {
      response = await this.call(input.accountExternalId, "send_message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: input.to, message: input.body }),
      });
    } catch (error) {
      const timeout = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false,
        errorCode: timeout ? "timeout" : "network_error",
        errorMessage: timeout ? "ChatPro API timed out" : "Could not reach ChatPro API",
        retryable: true,
      };
    }

    const json = (await response.json().catch(() => ({}))) as {
      resposeMessage?: { id?: string };
      responseMessage?: { id?: string };
      message?: string;
    };
    const id = json.resposeMessage?.id ?? json.responseMessage?.id;
    if (response.ok && id) return { ok: true, externalMessageId: id, acceptedAt: this.now() };

    return {
      ok: false,
      errorCode: response.status === 401 ? "chatpro_unauthorized" : `http_${response.status}`,
      // May echo the phone number; callers keep it out of logs.
      errorMessage: json.message ?? `HTTP ${response.status}`,
      retryable: response.status >= 500 || response.status === 429,
    };
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
