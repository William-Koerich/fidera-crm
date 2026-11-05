/**
 * WhatsApp Cloud API provider (WHATSAPP_PROVIDER=meta), e.g. the free Meta
 * test number from the developer app.
 *
 * Verified against developers.facebook.com on 2026-11-05:
 * - Send: POST https://graph.facebook.com/{version}/{phone-number-id}/messages
 *   body { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body } }
 *   success: { messaging_product, contacts: [{ input, wa_id }], messages: [{ id }] }
 * - Media: GET /{media-id}?phone_number_id=... -> { url, mime_type, ... };
 *   the url expires after 5 minutes and must be fetched with the same token.
 * Errors use the standard Graph envelope { error: { code, message, ... } }.
 */
import { computeReplyWindow, type ReplyWindowOptions } from "./reply-window";
import type {
  ChannelProvider,
  DownloadedMedia,
  NormalizedEvent,
  ReplyWindow,
  ReplyWindowConversation,
  SendMessageInput,
  SendResult,
} from "./types";
import { parseWhatsAppWebhook } from "./whatsapp/parse";

export const DEFAULT_GRAPH_API_VERSION = "v23.0";

/** Resolves the access token for a phone_number_id. */
export type TokenResolver = (accountExternalId: string) => Promise<string>;

export interface MetaChannelProviderOptions extends ReplyWindowOptions {
  getAccessToken: TokenResolver;
  apiVersion?: string;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

/**
 * Codes worth retrying: throttling and transient server errors. Everything
 * else (e.g. 131047 outside the window, 100 invalid parameter, 190 expired
 * token) needs a human or a different message.
 */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 613, 80007, 130429, 131000, 131016, 131056, 133004]);

interface GraphError {
  error?: { code?: number; message?: string };
}

/** Errors meaning the connection itself is gone and must be redone (190: access token expired/invalid). */
export function isDisconnectionError(errorCode: string): boolean {
  return errorCode === "190";
}

export class MetaChannelProvider implements ChannelProvider {
  readonly name = "meta" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly now: () => Date;

  constructor(private readonly options: MetaChannelProviderOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.baseUrl = `https://graph.facebook.com/${options.apiVersion ?? DEFAULT_GRAPH_API_VERSION}`;
    this.now = options.now ?? (() => new Date());
  }

  parseWebhook(payload: unknown): NormalizedEvent[] {
    return parseWhatsAppWebhook(payload);
  }

  getReplyWindow(conversation: ReplyWindowConversation, now: Date = this.now()): ReplyWindow {
    return computeReplyWindow(conversation, now, this.options);
  }

  private async request(url: string, init: RequestInit, token: string): Promise<Response> {
    return this.fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
    });
  }

  async sendMessage(input: SendMessageInput): Promise<SendResult> {
    if (input.channel !== "whatsapp") {
      return { ok: false, errorCode: "unsupported_channel", errorMessage: "Only WhatsApp is supported", retryable: false };
    }
    let response: Response;
    try {
      const token = await this.options.getAccessToken(input.accountExternalId);
      response = await this.request(
        `${this.baseUrl}/${encodeURIComponent(input.accountExternalId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: input.to,
            type: "text",
            text: { body: input.body, preview_url: false },
          }),
        },
        token,
      );
    } catch (error) {
      const timeout = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false,
        errorCode: timeout ? "timeout" : "network_error",
        errorMessage: timeout ? "Meta API timed out" : "Could not reach Meta API",
        retryable: true,
      };
    }

    const json = (await response.json().catch(() => ({}))) as GraphError & { messages?: { id?: string }[] };
    const id = json.messages?.[0]?.id;
    if (response.ok && id) return { ok: true, externalMessageId: id, acceptedAt: this.now() };

    const code = json.error?.code;
    return {
      ok: false,
      errorCode: code !== undefined ? String(code) : `http_${response.status}`,
      // Graph messages may echo parameters; callers keep them out of logs.
      errorMessage: json.error?.message ?? `HTTP ${response.status}`,
      retryable: code !== undefined ? RETRYABLE_CODES.has(code) : response.status >= 500 || response.status === 429,
    };
  }

  async downloadMedia(input: { accountExternalId: string; mediaId: string }): Promise<DownloadedMedia> {
    const token = await this.options.getAccessToken(input.accountExternalId);
    const metaUrl = new URL(`${this.baseUrl}/${encodeURIComponent(input.mediaId)}`);
    metaUrl.searchParams.set("phone_number_id", input.accountExternalId);

    const metaResponse = await this.request(metaUrl.toString(), { method: "GET" }, token);
    const meta = (await metaResponse.json().catch(() => ({}))) as GraphError & { url?: string; mime_type?: string };
    if (!metaResponse.ok || !meta.url) {
      throw new Error(`media lookup failed (${meta.error?.code ?? metaResponse.status})`);
    }

    const file = await this.request(meta.url, { method: "GET" }, token);
    if (!file.ok) throw new Error(`media download failed (${file.status})`);
    return {
      data: await file.arrayBuffer(),
      mimeType: meta.mime_type ?? file.headers.get("content-type") ?? "application/octet-stream",
    };
  }
}
