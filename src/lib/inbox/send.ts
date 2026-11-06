import "server-only";
import { randomUUID } from "node:crypto";
import { getProviderByName } from "@/lib/channels";
import type { SendResult } from "@/lib/channels/types";
import { isDisconnectionError } from "@/lib/channels/meta-provider";
import { logEvent } from "@/lib/log";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/webhooks/media";
import {
  attachmentPath,
  attachmentProblem,
  attachmentType,
  baseMimeType,
  isAttachmentPathOf,
} from "./attachments";
import type { ConversationDetail } from "./queries";
import { recordSendUsage } from "./usage";

export const MAX_MESSAGE_LENGTH = 4096;
/** Long enough for the provider to fetch the file, even after a retry on its side. */
const ATTACHMENT_URL_SECONDS = 3600;

export type SendReplyResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "too_long" | "window_closed" | "account_unavailable" | "no_recipient" | "provider_error" | "invalid_file" };

type NewMessage = Pick<TablesInsert<"messages">, "type" | "body" | "media_path" | "media_mime_type">;

function replyBlocker(conversation: ConversationDetail, now: Date): SendReplyResult | null {
  if (conversation.account.status !== "active") return { ok: false, reason: "account_unavailable" };
  if (!conversation.recipientExternalId) return { ok: false, reason: "no_recipient" };
  const window = getProviderByName(conversation.account.provider).getReplyWindow(
    {
      channel: conversation.channel,
      lastInboundAt: conversation.lastInboundAt ? new Date(conversation.lastInboundAt) : null,
    },
    now,
  );
  return window.isOpen ? null : { ok: false, reason: "window_closed" };
}

/**
 * Stores the outbound message, sends it and records the outcome and estimated
 * cost. The caller must have loaded `conversation` with the user's client (RLS).
 */
async function deliver(
  input: { conversation: ConversationDetail; userId: string; now: Date; message: NewMessage },
  send: (idempotencyKey: string) => Promise<SendResult>,
): Promise<SendReplyResult> {
  const { conversation, userId, now, message } = input;
  const supabase = await createClient();
  const { data: pending, error: insertError } = await supabase
    .from("messages")
    .insert({
      ...message,
      organization_id: conversation.organizationId,
      conversation_id: conversation.id,
      channel_account_id: conversation.account.id,
      direction: "outbound",
      origin: "api",
      status: "pending",
      sent_by: userId,
      occurred_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (insertError) throw new Error("Could not store outbound message");

  const result = await send(pending.id);

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
    // stored the message: keep that row, marked as sent from the app, with our file.
    const { data: echoed } = await admin
      .from("messages")
      .update({
        origin: "api",
        sent_by: userId,
        ...(message.media_path ? { media_path: message.media_path, media_mime_type: message.media_mime_type } : {}),
      })
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
    .update({ last_outbound_at: now.toISOString(), last_message_at: now.toISOString(), awaiting_reply: false, unread_count: 0, status: "open", closed_at: null, closed_by: null, ending_id: null })
    .eq("id", conversation.id);

  await recordSendUsage(admin, {
    organizationId: conversation.organizationId,
    accountId: conversation.account.id,
    provider: conversation.account.provider,
    messageId,
    now,
  });

  logEvent("message.sent", { conversationId: conversation.id, provider: conversation.account.provider });
  return { ok: true };
}

/** Sends a free-form text reply (inside the reply window only). */
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
  const now = input.now ?? new Date();
  const blocked = replyBlocker(conversation, now);
  if (blocked) return blocked;

  const provider = getProviderByName(conversation.account.provider);
  return deliver({ conversation, userId, now, message: { type: "text", body } }, (idempotencyKey) =>
    provider.sendMessage({
      channel: conversation.channel,
      accountExternalId: conversation.account.externalAccountId,
      to: conversation.recipientExternalId!,
      type: "text",
      body,
      idempotencyKey,
    }),
  );
}

export type AttachmentUpload =
  | { ok: true; path: string; token: string }
  | { ok: false; reason: "unsupported" | "too_large" | "empty" | "not_available" };

/** Gives the browser a one-time address to upload straight to the private bucket, past the server's body limit. */
export async function createAttachmentUpload(
  conversation: ConversationDetail,
  file: { mimeType: string; size: number },
): Promise<AttachmentUpload> {
  if (!getProviderByName(conversation.account.provider).sendMedia) return { ok: false, reason: "not_available" };
  const problem = attachmentProblem(file.mimeType, file.size);
  if (problem) return { ok: false, reason: problem };

  const path = attachmentPath(conversation.organizationId, conversation.id, randomUUID(), attachmentType(file.mimeType)!.extension);
  const { data, error } = await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(`Could not prepare the upload: ${error.message}`);
  return { ok: true, path, token: data.token };
}

/**
 * Sends an uploaded file. What is checked is what was stored, not what the browser
 * declared. The provider gets a temporary address, since the bucket stays private.
 */
export async function sendAttachment(input: {
  conversation: ConversationDetail;
  path: string;
  caption: string;
  userId: string;
  now?: Date;
}): Promise<SendReplyResult> {
  const { conversation, path, userId } = input;
  const caption = input.caption.trim();
  if (caption.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: "too_long" };
  if (!isAttachmentPathOf(path, conversation.organizationId, conversation.id)) return { ok: false, reason: "invalid_file" };
  const now = input.now ?? new Date();
  const blocked = replyBlocker(conversation, now);
  if (blocked) return blocked;
  const provider = getProviderByName(conversation.account.provider);
  if (!provider.sendMedia) return { ok: false, reason: "invalid_file" };

  const storage = createAdminClient().storage.from(MEDIA_BUCKET);
  const { data: signed } = await storage.createSignedUrl(path, ATTACHMENT_URL_SECONDS);
  if (!signed) return { ok: false, reason: "invalid_file" };
  const stored = await fetch(signed.signedUrl, { method: "HEAD", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const mimeType = stored?.ok ? baseMimeType(stored.headers.get("content-type") ?? "") : "";
  if (!stored?.ok || attachmentProblem(mimeType, Number(stored.headers.get("content-length") ?? 0))) {
    await storage.remove([path]);
    return { ok: false, reason: "invalid_file" };
  }

  const sendMedia = provider.sendMedia.bind(provider);
  return deliver(
    {
      conversation,
      userId,
      now,
      message: { type: attachmentType(mimeType)!.kind, body: caption || null, media_path: path, media_mime_type: mimeType },
    },
    (idempotencyKey) =>
      sendMedia({
        channel: conversation.channel,
        accountExternalId: conversation.account.externalAccountId,
        to: conversation.recipientExternalId!,
        url: signed.signedUrl,
        mimeType,
        ...(caption ? { caption } : {}),
        idempotencyKey,
      }),
  );
}
