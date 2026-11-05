import "server-only";
import { getProviderByName } from "@/lib/channels";
import { logEvent } from "@/lib/log";
import type { AdminClient } from "@/lib/supabase/server";

export const MEDIA_BUCKET = "crm-media";
/** Media we do not copy (too large); the message keeps its text/caption. */
export const MEDIA_UNAVAILABLE = "unavailable";
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
/** Media ids from webhooks expire after 7 days. */
const MEDIA_ID_TTL_MS = 7 * 24 * 3_600_000;

/**
 * Copies recent inbound media (still only referenced by the channel media id)
 * into the private bucket at <organization_id>/<message_id>. Clients only
 * ever get short-lived signed URLs.
 */
export async function fetchPendingMedia(admin: AdminClient, limit = 10): Promise<number> {
  const since = new Date(Date.now() - MEDIA_ID_TTL_MS).toISOString();
  const { data, error } = await admin
    .from("messages")
    .select("id, organization_id, media_external_id, media_mime_type, channel_accounts(provider, external_account_id)")
    .eq("direction", "inbound")
    .is("media_path", null)
    .not("media_external_id", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error || !data) return 0;

  let stored = 0;
  for (const m of data) {
    const account = m.channel_accounts;
    if (!account || !m.media_external_id) continue;
    const provider = getProviderByName(account.provider);
    if (!provider.downloadMedia) continue;

    try {
      const media = await provider.downloadMedia({
        accountExternalId: account.external_account_id,
        mediaId: m.media_external_id,
      });
      if (media.data.byteLength > MAX_MEDIA_BYTES) {
        await admin.from("messages").update({ media_path: MEDIA_UNAVAILABLE }).eq("id", m.id);
        continue;
      }
      const path = `${m.organization_id}/${m.id}`;
      const { error: uploadError } = await admin.storage
        .from(MEDIA_BUCKET)
        .upload(path, media.data, { contentType: media.mimeType, upsert: true });
      if (uploadError) throw new Error(`upload: ${uploadError.message}`);
      await admin
        .from("messages")
        .update({ media_path: path, media_mime_type: m.media_mime_type ?? media.mimeType })
        .eq("id", m.id);
      stored += 1;
    } catch (e) {
      logEvent("media.download_failed", { messageId: m.id, error: e instanceof Error ? e.message : "unknown" }, "warn");
    }
  }
  return stored;
}
