import "server-only";
import { getProviderByName } from "@/lib/channels";
import type { Channel, SendResult } from "@/lib/channels/types";
import { MAX_AUTO_REPLIES_PER_HOUR, VOICE_NOTE_MIME, type SendTarget } from "@/lib/replies/auto-reply";
import { supabaseAutoReplyStore } from "@/lib/replies/auto-reply-store";
import type { Enums } from "@/lib/supabase/database.types";
import type { AdminClient } from "@/lib/supabase/server";

export interface AutomaticTarget extends SendTarget {
  accountExternalId: string;
  channel: Channel;
  to: string;
}

/**
 * Sends a text nobody on the team wrote: stored as automatic, counted in the business's
 * hourly limit, and it does not count as the team answering.
 */
export async function sendAutomatic(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  target: AutomaticTarget,
  body: string,
): Promise<SendResult | "hourly_limit"> {
  const store = supabaseAutoReplyStore(admin, providerName);
  const now = new Date();
  const recent = await store.countRecent(target.organizationId, new Date(now.getTime() - 3_600_000));
  if (recent >= MAX_AUTO_REPLIES_PER_HOUR) return "hourly_limit";

  const messageId = await store.createPending(target, { type: "text", body }, now);
  const result = await getProviderByName(providerName).sendMessage({
    channel: target.channel,
    accountExternalId: target.accountExternalId,
    to: target.to,
    type: "text",
    body,
    idempotencyKey: messageId,
  });
  if (result.ok) await store.markSent(target, messageId, result.externalMessageId, now);
  else await store.markFailed(messageId, result.errorCode);
  return result;
}

/**
 * Sends a recorded voice note the same way: Ogg Opus, so WhatsApp shows it as recorded on the
 * spot. "unavailable" when the provider cannot send files or the recording is gone.
 */
export async function sendAutomaticVoiceNote(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  target: AutomaticTarget,
  audioPath: string,
): Promise<SendResult | "hourly_limit" | "unavailable"> {
  const provider = getProviderByName(providerName);
  if (!provider.sendMedia) return "unavailable";
  const store = supabaseAutoReplyStore(admin, providerName);
  const url = await store.fileUrl(target.organizationId, audioPath);
  if (!url) return "unavailable";
  const now = new Date();
  const recent = await store.countRecent(target.organizationId, new Date(now.getTime() - 3_600_000));
  if (recent >= MAX_AUTO_REPLIES_PER_HOUR) return "hourly_limit";

  const messageId = await store.createPending(target, { type: "audio", mediaPath: audioPath, mimeType: VOICE_NOTE_MIME }, now);
  const result = await provider.sendMedia({
    channel: target.channel,
    accountExternalId: target.accountExternalId,
    to: target.to,
    url,
    mimeType: VOICE_NOTE_MIME,
    idempotencyKey: messageId,
  });
  if (result.ok) await store.markSent(target, messageId, result.externalMessageId, now);
  else await store.markFailed(messageId, result.errorCode);
  return result;
}
