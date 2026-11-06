import "server-only";
import { getProviderByName } from "@/lib/channels";
import { logEvent } from "@/lib/log";
import type { Enums } from "@/lib/supabase/database.types";
import type { AdminClient } from "@/lib/supabase/server";

/** Keeps a webhook delivery short: the rest is picked up by the next one. */
const MAX_PER_RUN = 5;

/**
 * Repeats on the channel's own system what the database assigned by itself. Claims
 * each conversation first, so a parallel run does not repeat the call.
 */
export async function mirrorAutoAssignments(admin: AdminClient, providerName: Enums<"channel_provider">): Promise<void> {
  const provider = getProviderByName(providerName);

  const { data: pending, error } = await admin
    .from("conversations")
    .select("id, organization_id, assigned_to, contact_id, channel, channel_accounts!inner(external_account_id, provider)")
    .eq("assign_mirror_pending", true)
    .eq("channel_accounts.provider", providerName)
    .limit(MAX_PER_RUN);
  if (error) throw new Error(`Could not load pending assignments (${error.code})`);

  for (const conversation of pending) {
    const { data: claimed } = await admin
      .from("conversations")
      .update({ assign_mirror_pending: false })
      .eq("id", conversation.id)
      .eq("assign_mirror_pending", true)
      .select("id");
    if (!claimed?.length || !provider.assignConversation || !conversation.assigned_to) continue;

    const [{ data: identity }, { data: user }] = await Promise.all([
      admin
        .from("contact_identities")
        .select("external_id")
        .eq("organization_id", conversation.organization_id)
        .eq("contact_id", conversation.contact_id)
        .eq("channel", conversation.channel)
        .limit(1)
        .maybeSingle(),
      admin.auth.admin.getUserById(conversation.assigned_to),
    ]);
    if (!identity || !user.user?.email) continue;

    const result = await provider.assignConversation({
      accountExternalId: conversation.channel_accounts.external_account_id,
      to: identity.external_id,
      assigneeEmail: user.user.email,
    });
    if (result !== "assigned") logEvent("conversation.assign_not_mirrored", { conversationId: conversation.id, result }, "warn");
  }
}
