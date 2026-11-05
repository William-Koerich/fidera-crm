/**
 * WhatsApp Cloud API providers.
 *
 * - "meta": calls graph.facebook.com directly (Meta test number / own app).
 * - "coexy": calls Coexy's meta-proxy, which forwards the same request to the
 *   official Cloud API for numbers connected through Coexy (coexistence).
 *
 * Verified against developers.facebook.com on 2026-11-05:
 * - Send: POST {base}/{phone-number-id}/messages
 *   body { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body } }
 *   success: { messaging_product, contacts: [{ input, wa_id }], messages: [{ id }] }
 * - Media: GET {base}/{media-id}?phone_number_id=... -> { url, mime_type, ... };
 *   the url expires after 5 minutes and must be fetched with the same token.
 * Errors use the standard Graph envelope { error: { code, message, ... } }.
 *
 * Coexy (third-party spec, confirm in the Coexy panel): base
 * https://api.coexy.com.br/functions/v1/meta-proxy, "Authorization: Bearer
 * <channel_token>", optional `idempotency_key` in the body (stripped before
 * forwarding), 403 "Channel is not active", 503 CHANNEL_DISCONNECTED.
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
export const COEXY_META_PROXY_URL = "https://api.coexy.com.br/functions/v1/meta-proxy";

/** Resolves the access token for a phone_number_id. */
export type TokenResolver = (accountExternalId: string) => Promise<string>;

export interface CloudApiProviderOptions extends ReplyWindowOptions {
  name: "meta" | "coexy";
  /** Base URL without trailing slash, e.g. https://graph.facebook.com/v23.0 */
  baseUrl: string;
  getAccessToken: TokenResolver;
  /** Send an idempotency_key in the body (Coexy). */
  sendIdempotencyKey?: boolean;
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
  error?: { code?: number | string; message?: string };
  code?: string;
  message?: string;
}

/** Errors meaning the connection itself is gone and must be redone by the owner. */
export function isDisconnectionError(errorCode: string): boolean {
  return errorCode === "CHANNEL_DISCONNECTED" || errorCode === "http_403" || errorCode === "http_503" || errorCode === "190";
}

export class CloudApiProvider implements ChannelProvider {
  readonly name: "meta" | "coexy";
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: CloudApiProviderOptions) {
    this.name = options.name;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  parseWebhook(payload: unknown): NormalizedEvent[] {
    return parseWhatsAppWebhook(payload);
  }

  getReplyWindow(conversation: ReplyWindowConversation, now: Date = this.now()): ReplyWindow {
    return computeReplyWindow(conversation, now, this.options);
  }

  private url(path: string): string {
    return `${this.options.baseUrl.replace(/\/$/, "")}/${path}`;
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
        this.url(`${encodeURIComponent(input.accountExternalId)}/messages`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: input.to,
            type: "text",
            text: { body: input.body, preview_url: false },
            ...(this.options.sendIdempotencyKey && input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
          }),
        },
        token,
      );
    } catch (error) {
      const timeout = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false,
        errorCode: timeout ? "timeout" : "network_error",
        errorMessage: timeout ? "Provider API timed out" : "Could not reach provider API",
        retryable: true,
      };
    }

    const json = (await response.json().catch(() => ({}))) as GraphError & { messages?: { id?: string }[] };
    const id = json.messages?.[0]?.id;
    if (response.ok && id) return { ok: true, externalMessageId: id, acceptedAt: this.now() };

    const graphCode = json.error?.code;
    const errorCode =
      graphCode !== undefined ? String(graphCode) : json.code ? String(json.code) : `http_${response.status}`;
    const numeric = typeof graphCode === "number" ? graphCode : Number(graphCode);
    return {
      ok: false,
      errorCode,
      // Provider messages may echo parameters; callers keep them out of logs.
      errorMessage: json.error?.message ?? json.message ?? `HTTP ${response.status}`,
      retryable: Number.isFinite(numeric)
        ? RETRYABLE_CODES.has(numeric)
        : response.status >= 500 && errorCode !== "CHANNEL_DISCONNECTED"
          ? true
          : response.status === 429,
    };
  }

  async downloadMedia(input: { accountExternalId: string; mediaId: string }): Promise<DownloadedMedia> {
    const token = await this.options.getAccessToken(input.accountExternalId);
    const metaUrl = new URL(this.url(encodeURIComponent(input.mediaId)));
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

type FactoryOptions = Omit<CloudApiProviderOptions, "name" | "baseUrl" | "sendIdempotencyKey"> & {
  apiVersion?: string;
  baseUrl?: string;
};

/** Direct Meta Graph API (e.g. the free Meta test number). */
export class MetaChannelProvider extends CloudApiProvider {
  constructor(options: FactoryOptions) {
    super({
      ...options,
      name: "meta",
      baseUrl: options.baseUrl ?? `https://graph.facebook.com/${options.apiVersion ?? DEFAULT_GRAPH_API_VERSION}`,
    });
  }
}

/** Coexy meta-proxy: official Cloud API with WhatsApp Business app coexistence. */
export class CoexyChannelProvider extends CloudApiProvider {
  constructor(options: FactoryOptions) {
    super({ ...options, name: "coexy", baseUrl: options.baseUrl ?? COEXY_META_PROXY_URL, sendIdempotencyKey: true });
  }
}
