import "server-only";
import { getProviderByName } from "@/lib/channels";
import type { NormalizedEvent } from "@/lib/channels/types";
import { logEvent } from "@/lib/log";
import type { Enums } from "@/lib/supabase/database.types";
import type { AdminClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/webhooks/media";
import { chooseContactName } from "./name";

/** People change names and photos rarely: at most one lookup a week per contact. */
const PROFILE_MAX_AGE_MS = 7 * 24 * 3_600_000;
/** Keeps a webhook delivery or import step short. */
const MAX_LOOKUPS_PER_BATCH = 3;

/** Updates one contact's name and photo from the channel. Rate limit errors reach the caller. */
export async function syncContactProfile(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  input: { accountExternalId: string; organizationId: string; contactId: string; externalId: string },
): Promise<void> {
  const provider = getProviderByName(providerName);
  if (!provider.getContactProfile) return;
  const profile = await provider.getContactProfile(input.accountExternalId, input.externalId);

  const { data: contact, error } = await admin
    .from("contacts")
    .select("display_name, avatar_path")
    .eq("id", input.contactId)
    .eq("organization_id", input.organizationId)
    .single();
  if (error) throw new Error(`Could not load contact (${error.code})`);

  let avatarPath = contact.avatar_path;
  if (profile?.imageUrl && provider.downloadContactPhoto) {
    try {
      const photo = await provider.downloadContactPhoto(profile.imageUrl);
      const path = `${input.organizationId}/avatars/${input.contactId}`;
      const { error: uploadError } = await admin.storage
        .from(MEDIA_BUCKET)
        .upload(path, photo.data, { contentType: photo.mimeType, upsert: true });
      if (uploadError) throw new Error(`upload: ${uploadError.message}`);
      avatarPath = path;
    } catch (e) {
      // Keeps the previous photo: WhatsApp links expire and a later sync tries again.
      logEvent("contact.photo_failed", { contactId: input.contactId, error: e instanceof Error ? e.message : "unknown" }, "warn");
    }
  } else if (profile && !profile.imageUrl && avatarPath) {
    await admin.storage.from(MEDIA_BUCKET).remove([avatarPath]);
    avatarPath = null;
  }

  const { error: updateError } = await admin
    .from("contacts")
    .update({
      display_name: profile ? chooseContactName(contact.display_name, profile) : contact.display_name,
      avatar_path: avatarPath,
      profile_synced_at: new Date().toISOString(),
    })
    .eq("id", input.contactId);
  if (updateError) throw new Error(`Could not update contact (${updateError.code})`);
}

/** Refreshes contacts seen in these events when their profile is missing or old. Never blocks the caller's work. */
export async function refreshStaleProfiles(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  events: NormalizedEvent[],
): Promise<void> {
  if (!getProviderByName(providerName).getContactProfile) return;

  const seen = new Set<string>();
  for (const event of events) {
    if (event.kind !== "message" || seen.has(event.contact.externalId) || seen.size >= MAX_LOOKUPS_PER_BATCH) continue;
    seen.add(event.contact.externalId);

    const { data: account } = await admin
      .from("channel_accounts")
      .select("organization_id")
      .eq("provider", providerName)
      .eq("channel", event.channel)
      .eq("external_account_id", event.accountExternalId)
      .maybeSingle();
    if (!account) continue;

    const { data: identity } = await admin
      .from("contact_identities")
      .select("contact_id, contacts(profile_synced_at)")
      .eq("organization_id", account.organization_id)
      .eq("channel", event.channel)
      .eq("external_id", event.contact.externalId)
      .maybeSingle();
    if (!identity) continue;

    const syncedAt = identity.contacts?.profile_synced_at;
    if (syncedAt && Date.now() - new Date(syncedAt).getTime() < PROFILE_MAX_AGE_MS) continue;

    await syncContactProfile(admin, providerName, {
      accountExternalId: event.accountExternalId,
      organizationId: account.organization_id,
      contactId: identity.contact_id,
      externalId: event.contact.externalId,
    });
  }
}
