import { randomUUID } from "node:crypto";
import { computeReplyWindow, type ReplyWindowOptions } from "./reply-window";
import type {
  ChannelProvider,
  NormalizedEvent,
  ReplyWindow,
  ReplyWindowConversation,
  SendMessageInput,
  SendResult,
} from "./types";
import { parseWhatsAppWebhook } from "./whatsapp/parse";

export interface SentMockMessage extends SendMessageInput {
  externalMessageId: string;
  acceptedAt: Date;
}

export interface MockChannelProviderOptions extends ReplyWindowOptions {
  /** Clock override for deterministic tests. */
  now?: () => Date;
}

/**
 * Default provider for development and tests (WHATSAPP_PROVIDER=mock).
 * Parses the same webhook shape as the WhatsApp Cloud API and "sends" by
 * recording messages in memory. No network, no Meta account.
 */
export class MockChannelProvider implements ChannelProvider {
  readonly name = "mock" as const;
  readonly sent: SentMockMessage[] = [];
  private nextFailure: { errorCode: string; errorMessage: string; retryable: boolean } | null = null;
  private readonly now: () => Date;

  constructor(private readonly options: MockChannelProviderOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  parseWebhook(payload: unknown): NormalizedEvent[] {
    return parseWhatsAppWebhook(payload);
  }

  async sendMessage(input: SendMessageInput): Promise<SendResult> {
    if (this.nextFailure) {
      const failure = this.nextFailure;
      this.nextFailure = null;
      return { ok: false, ...failure };
    }
    if (!input.body.trim()) {
      return { ok: false, errorCode: "empty_body", errorMessage: "Message body is empty", retryable: false };
    }
    const sent: SentMockMessage = {
      ...input,
      externalMessageId: `mock.${randomUUID()}`,
      acceptedAt: this.now(),
    };
    this.sent.push(sent);
    return { ok: true, externalMessageId: sent.externalMessageId, acceptedAt: sent.acceptedAt };
  }

  getReplyWindow(conversation: ReplyWindowConversation, now: Date = this.now()): ReplyWindow {
    return computeReplyWindow(conversation, now, this.options);
  }

  /** Test helper: makes the next sendMessage fail. */
  failNextSend(errorCode = "mock_failure", errorMessage = "Simulated failure", retryable = true): void {
    this.nextFailure = { errorCode, errorMessage, retryable };
  }
}
