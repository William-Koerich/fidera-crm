import "server-only";
import { getProviderByName } from "@/lib/channels";
import type { NormalizedEvent } from "@/lib/channels/types";
import { sendAutomatic, sendAutomaticVoiceNote, type AutomaticTarget } from "@/lib/inbox/automatic";
import { logEvent } from "@/lib/log";
import { MAX_MESSAGE_AGE_MS } from "@/lib/replies/auto-reply";
import type { Enums } from "@/lib/supabase/database.types";
import type { AdminClient } from "@/lib/supabase/server";
import { findCampaign } from "./match";

interface Campaign {
  id: string;
  name: string;
  triggerText: string;
  labelId: string | null;
  replyFormat: string;
  replyText: string;
  replyAudioPath: string | null;
}

/**
 * Recognizes campaign messages: labels the contact, notes it in the conversation and, the first
 * time, sends the campaign's own reply. Returns the messages it answered, so the greeting, the AI
 * and the bot do not answer them again. One failure never stops the others or the webhook.
 */
export async function runCampaigns(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  events: NormalizedEvent[],
  now = new Date(),
): Promise<Set<string>> {
  const answered = new Set<string>();
  const byOrganization = new Map<string, Campaign[]>();
  for (const event of events) {
    if (event.kind !== "message" || event.direction !== "inbound" || event.origin !== "customer") continue;
    if (event.type !== "text" || !event.body) continue;
    if (now.getTime() - event.occurredAt.getTime() > MAX_MESSAGE_AGE_MS) continue;
    try {
      if (await handle(admin, providerName, event, byOrganization)) answered.add(event.externalMessageId);
    } catch (e) {
      logEvent("campaign.failed", { error: e instanceof Error ? e.message : "unknown" }, "error");
    }
  }
  return answered;
}

async function campaignsOf(admin: AdminClient, organizationId: string, cache: Map<string, Campaign[]>): Promise<Campaign[]> {
  const cached = cache.get(organizationId);
  if (cached) return cached;
  const { data } = await admin
    .from("campaigns")
    .select("id, name, trigger_text, label_id, reply_format, reply_text, reply_audio_path")
    .eq("organization_id", organizationId)
    .eq("enabled", true);
  const list = (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    triggerText: c.trigger_text,
    labelId: c.label_id,
    replyFormat: c.reply_format,
    replyText: c.reply_text,
    replyAudioPath: c.reply_audio_path,
  }));
  cache.set(organizationId, list);
  return list;
}

async function handle(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  event: Extract<NormalizedEvent, { kind: "message" }>,
  cache: Map<string, Campaign[]>,
): Promise<boolean> {
  const { data: account } = await admin
    .from("channel_accounts")
    .select("id, organization_id, status")
    .eq("provider", providerName)
    .eq("channel", event.channel)
    .eq("external_account_id", event.accountExternalId)
    .maybeSingle();
  if (account?.status !== "active") return false;
  const organizationId = account.organization_id;

  const campaign = findCampaign(event.body ?? "", await campaignsOf(admin, organizationId, cache));
  if (!campaign) return false;

  const { data: message } = await admin
    .from("messages")
    .select("id, conversation_id, conversations(contact_id, last_outbound_at)")
    .eq("channel_account_id", account.id)
    .eq("external_message_id", event.externalMessageId)
    .maybeSingle();
  if (!message?.conversations) return false;
  const contactId = message.conversations.contact_id;
  const conversationId = message.conversation_id;

  // One row per person: the first insert wins the right to reply, later messages only count.
  const { data: inserted } = await admin
    .from("campaign_contacts")
    .upsert(
      { campaign_id: campaign.id, organization_id: organizationId, contact_id: contactId, conversation_id: conversationId },
      { onConflict: "campaign_id,contact_id", ignoreDuplicates: true },
    )
    .select("campaign_id");
  const first = !!inserted?.length;
  if (!first) {
    const { data: row } = await admin
      .from("campaign_contacts")
      .select("messages")
      .eq("campaign_id", campaign.id)
      .eq("contact_id", contactId)
      .maybeSingle();
    await admin
      .from("campaign_contacts")
      .update({ messages: (row?.messages ?? 0) + 1, last_at: new Date().toISOString(), conversation_id: conversationId })
      .eq("campaign_id", campaign.id)
      .eq("contact_id", contactId);
  }

  if (campaign.labelId) await applyLabel(admin, providerName, { organizationId, contactId, labelId: campaign.labelId, event });

  if (!first) return false;
  await admin.from("conversation_notes").insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    author_id: null,
    body: `Veio pela campanha "${campaign.name}".`,
  });
  logEvent("campaign.matched", { campaignId: campaign.id, conversationId });

  if (campaign.replyFormat === "none") return false;
  const target: AutomaticTarget = {
    organizationId,
    accountId: account.id,
    conversationId,
    lastOutboundAt: message.conversations.last_outbound_at,
    accountExternalId: event.accountExternalId,
    channel: event.channel,
    to: event.contact.externalId,
  };
  let result =
    campaign.replyFormat === "audio" && campaign.replyAudioPath
      ? await sendAutomaticVoiceNote(admin, providerName, target, campaign.replyAudioPath)
      : null;
  // Without the recording (or a provider for files), the text goes, when there is one.
  if ((result === null || result === "unavailable") && campaign.replyText) result = await sendAutomatic(admin, providerName, target, campaign.replyText);
  if (result === null || result === "unavailable") return false;
  if (result === "hourly_limit" || !result.ok) {
    logEvent("campaign.reply_failed", { campaignId: campaign.id, reason: result === "hourly_limit" ? "hourly_limit" : result.errorCode }, "warn");
    return false;
  }
  // The campaign's reply is this contact's welcome: the generic greeting does not follow.
  await admin.from("conversations").update({ greeted_at: new Date().toISOString() }).eq("id", conversationId).is("greeted_at", null);
  return true;
}

async function applyLabel(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  input: { organizationId: string; contactId: string; labelId: string; event: Extract<NormalizedEvent, { kind: "message" }> },
) {
  const { data: existing } = await admin
    .from("contact_labels")
    .select("label_id")
    .eq("contact_id", input.contactId)
    .eq("label_id", input.labelId)
    .maybeSingle();
  if (existing) return;
  const { error } = await admin
    .from("contact_labels")
    .insert({ organization_id: input.organizationId, contact_id: input.contactId, label_id: input.labelId });
  if (error && error.code !== "23505") throw new Error(`campaign label failed (${error.code})`);

  // The channel follows when it can; the CRM is the record.
  const sync = getProviderByName(providerName).team;
  if (!sync) return;
  const { data: label } = await admin.from("labels").select("external_id").eq("id", input.labelId).maybeSingle();
  if (!label?.external_id) return;
  const mirrored = await sync.setContactLabel({
    accountExternalId: input.event.accountExternalId,
    to: input.event.contact.externalId,
    labelExternalId: label.external_id,
    on: true,
  });
  if (!mirrored) logEvent("campaign.label_not_mirrored", { labelId: input.labelId }, "warn");
}
