import "server-only";
import { getProviderByName } from "@/lib/channels";
import { estimateSendCost } from "@/lib/billing/pricing";
import { logEvent } from "@/lib/log";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { ConversationDetail } from "./queries";

export const MAX_MESSAGE_LENGTH = 4096;

export type SendReplyResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "too_long" | "window_closed" | "account_unavailable" | "no_recipient" | "provider_error" };

/**
 * Sends a free-form reply through the channel provider (inside the reply
 * window only), stores the outbound message and records its estimated cost.
 * The caller must have loaded `conversation` with the user's client (RLS).
 */
export async function sendReply(input: {
  conversation: ConversationDetail;
  body: string;
  userId: string;
  now?: Date;
}): Promise<SendReplyResult> {
  const { conversation, userId } = input;
  const body = input.body.trim();
  if (!body) return { ok: false, reason: "empty" };
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: "too_long" };
  if (conversation.account.status !== "active") return { ok: false, reason: "account_unavailable" };
  if (!conversation.recipientExternalId) return { ok: false, reason: "no_recipient" };

  const provider = getProviderByName(conversation.account.provider);
  const now = input.now ?? new Date();
  const window = provider.getReplyWindow(
    {
      channel: conversation.channel,
      lastInboundAt: conversation.lastInboundAt ? new Date(conversation.lastInboundAt) : null,
    },
    now,
  );
  if (!window.isOpen) return { ok: false, reason: "window_closed" };

  const supabase = await createClient();
  const { data: pending, error: insertError } = await supabase
    .from("messages")
    .insert({
      organization_id: conversation.organizationId,
      conversation_id: conversation.id,
      channel_account_id: conversation.account.id,
      direction: "outbound",
      origin: "api",
      type: "text",
      body,
      status: "pending",
      sent_by: userId,
      occurred_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (insertError) throw new Error("Could not store outbound message");

  const result = await provider.sendMessage({
    channel: conversation.channel,
    accountExternalId: conversation.account.externalAccountId,
    to: conversation.recipientExternalId,
    type: "text",
    body,
  });

  if (!result.ok) {
    await supabase.from("messages").update({ status: "failed", error_code: result.errorCode }).eq("id", pending.id);
    logEvent("message.send_failed", { conversationId: conversation.id, errorCode: result.errorCode }, "warn");
    return { ok: false, reason: "provider_error" };
  }

  await supabase
    .from("messages")
    .update({ status: "sent", external_message_id: result.externalMessageId })
    .eq("id", pending.id);
  await supabase
    .from("conversations")
    .update({ last_outbound_at: now.toISOString(), last_message_at: now.toISOString(), awaiting_reply: false, unread_count: 0 })
    .eq("id", conversation.id);

  // usage_ledger is server-only: record the estimated Meta cost of this send.
  const admin = createAdminClient();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count } = await admin
    .from("usage_ledger")
    .select("id", { count: "exact", head: true })
    .eq("channel_account_id", conversation.account.id)
    .eq("category", "service")
    .gte("occurred_at", monthStart);
  const { error: ledgerError } = await admin.from("usage_ledger").insert({
    organization_id: conversation.organizationId,
    channel_account_id: conversation.account.id,
    message_id: pending.id,
    category: "service",
    estimated_cost: conversation.account.provider === "mock" ? 0 : estimateSendCost("service", count ?? 0),
    occurred_at: now.toISOString(),
  });
  if (ledgerError) logEvent("usage_ledger.insert_failed", { messageId: pending.id }, "error");

  logEvent("message.sent", { conversationId: conversation.id, provider: conversation.account.provider });
  return { ok: true };
}
