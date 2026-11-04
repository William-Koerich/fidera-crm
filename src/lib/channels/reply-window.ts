import type { ReplyWindow, ReplyWindowConversation } from "./types";

const HOUR = 60 * 60 * 1000;
export const STANDARD_WINDOW_MS = 24 * HOUR;
/** Instagram Human Agent tag: up to 7 days, human replies only, after approval. */
export const INSTAGRAM_HUMAN_AGENT_MS = 7 * 24 * HOUR;

export interface ReplyWindowOptions {
  /** Instagram Human Agent permission approved for this app. */
  humanAgentApproved?: boolean;
}

export function computeReplyWindow(
  conversation: ReplyWindowConversation,
  now: Date = new Date(),
  options: ReplyWindowOptions = {},
): ReplyWindow {
  const last = conversation.lastInboundAt;
  if (!last) {
    return { isOpen: false, endsAt: null, remainingMs: 0, humanAgentEndsAt: null };
  }

  const endsAt = new Date(last.getTime() + STANDARD_WINDOW_MS);
  const remainingMs = Math.max(0, endsAt.getTime() - now.getTime());
  const humanAgentEndsAt =
    conversation.channel === "instagram" && options.humanAgentApproved
      ? new Date(last.getTime() + INSTAGRAM_HUMAN_AGENT_MS)
      : null;

  return { isOpen: remainingMs > 0, endsAt, remainingMs, humanAgentEndsAt };
}
