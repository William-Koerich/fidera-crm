import "server-only";
import { getProviderByName } from "@/lib/channels";
import { isDisconnectionError } from "@/lib/channels/meta-provider";
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
    idempotencyKey: pending.id,
  });

  if (!result.ok) {
    await supabase.from("messages").update({ status: "failed", error_code: result.errorCode }).eq("id", pending.id);
    if (conversation.account.provider !== "mock" && isDisconnectionError(result.errorCode)) {
      // The owner must reconnect: surface it in the inbox and settings.
      const admin = createAdminClient();
      await admin
        .from("channel_accounts")
        .update({ status: "disconnected", disconnected_reason: result.errorCode })
        .eq("id", conversation.account.id);
      await admin.from("audit_log").insert({
        organization_id: conversation.organizationId,
        actor_id: userId,
        action: "channel_account.disconnected_on_send",
        target_table: "channel_accounts",
        target_id: conversation.account.id,
        metadata: { error_code: result.errorCode },
      });
      return { ok: false, reason: "account_unavailable" };
    }
    logEvent("message.send_failed", { conversationId: conversation.id, errorCode: result.errorCode }, "warn");
    return { ok: false, reason: "provider_error" };
  }

  const admin = createAdminClient();
  let messageId = pending.id;
  const { error: sentError } = await supabase
    .from("messages")
    .update({ status: "sent", external_message_id: result.externalMessageId })
    .eq("id", pending.id);
  if (sentError?.code === "23505") {
    // ChatPro's webhook for this send arrived before the API response and already
    // stored the message: keep that row, marked as sent from the app.
    const { data: echoed } = await admin
      .from("messages")
      .update({ origin: "api", sent_by: userId })
      .eq("channel_account_id", conversation.account.id)
      .eq("external_message_id", result.externalMessageId)
      .select("id")
      .single();
    if (echoed) {
      await admin.from("messages").delete().eq("id", pending.id);
      messageId = echoed.id;
    }
  } else if (sentError) {
    logEvent("message.update_failed", { messageId: pending.id, code: sentError.code }, "error");
  }
  await supabase
    .from("conversations")
    .update({ last_outbound_at: now.toISOString(), last_message_at: now.toISOString(), awaiting_reply: false, unread_count: 0 })
    .eq("id", conversation.id);

  // usage_ledger is server-only: record the estimated Meta cost of this send.
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
    message_id: messageId,
    category: "service",
    // Only Meta charges per message.
    estimated_cost: conversation.account.provider === "meta" ? estimateSendCost("service", count ?? 0) : 0,
    occurred_at: now.toISOString(),
  });
  if (ledgerError) logEvent("usage_ledger.insert_failed", { messageId }, "error");

  logEvent("message.sent", { conversationId: conversation.id, provider: conversation.account.provider });
  return { ok: true };
}
