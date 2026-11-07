import { randomUUID } from "node:crypto";
import type { ChannelProvider, NormalizedEvent, ReplyWindow, SendMessageInput, SendResult } from "./types";

/**
 * Chat on the business's own website. There is no outside service: a reply is delivered by being
 * stored, and the visitor's page reads it. So "sending" always succeeds and has no time window.
 */
export class WebchatProvider implements ChannelProvider {
  readonly name = "webchat" as const;

  parseWebhook(): NormalizedEvent[] {
    return [];
  }

  async sendMessage(input: SendMessageInput): Promise<SendResult> {
    if (!input.body.trim()) return { ok: false, errorCode: "empty_body", errorMessage: "Message body is empty", retryable: false };
    return { ok: true, externalMessageId: `webchat.${randomUUID()}`, acceptedAt: new Date() };
  }

  getReplyWindow(): ReplyWindow {
    return { isOpen: true, endsAt: null, remainingMs: Number.POSITIVE_INFINITY, humanAgentEndsAt: null };
  }
}
