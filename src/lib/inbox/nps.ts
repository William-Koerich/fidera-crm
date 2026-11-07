import "server-only";
import { sendAutomatic, type AutomaticTarget } from "@/lib/inbox/automatic";
import { logEvent } from "@/lib/log";
import { NPS_ANSWER_WINDOW_MS, canAskAgain } from "@/lib/replies/nps";
import type { Enums } from "@/lib/supabase/database.types";
import type { AdminClient } from "@/lib/supabase/server";

const MAX_THANKS_PER_RUN = 5;

export type SurveyOutcome = "sent" | "asked_recently" | "hourly_limit" | "failed";

type ConversationRef = AutomaticTarget;

/** Asks for a rating on a conversation just finished. Records the survey before sending, so a fast answer finds it. */
export async function sendNpsSurvey(
  admin: AdminClient,
  providerName: Enums<"channel_provider">,
  input: ConversationRef & { contactId: string; assignedTo: string | null; question: string },
): Promise<SurveyOutcome> {
  const now = new Date();
  const { data: last } = await admin
    .from("nps_surveys")
    .select("sent_at")
    .eq("contact_id", input.contactId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!canAskAgain(last?.sent_at ?? null, now)) return "asked_recently";

  const { data: survey, error } = await admin
    .from("nps_surveys")
    .insert({
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      contact_id: input.contactId,
      assigned_to: input.assignedTo,
      sent_at: now.toISOString(),
      expires_at: new Date(now.getTime() + NPS_ANSWER_WINDOW_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not record the survey (${error.code})`);

  const result = await sendAutomatic(admin, providerName, input, input.question);
  if (result !== "hourly_limit" && result.ok) return "sent";
  // Never reached the customer: a stray "5" must not count, and it should not hold the cooldown.
  await admin.from("nps_surveys").delete().eq("id", survey.id);
  return result === "hourly_limit" ? "hourly_limit" : "failed";
}

/** Thanks those who answered. Claims each survey first, so a retried webhook does not thank twice. */
export async function sendNpsThanks(admin: AdminClient, providerName: Enums<"channel_provider">): Promise<void> {
  const { data: pending, error } = await admin
    .from("nps_surveys")
    .select("id, organization_id, conversation_id, contact_id, conversations!inner(channel, channel_account_id, last_outbound_at, channel_accounts!inner(external_account_id, provider))")
    .eq("thanks_pending", true)
    .eq("conversations.channel_accounts.provider", providerName)
    .limit(MAX_THANKS_PER_RUN);
  if (error) throw new Error(`Could not load pending thanks (${error.code})`);

  for (const survey of pending) {
    const { data: claimed } = await admin
      .from("nps_surveys")
      .update({ thanks_pending: false })
      .eq("id", survey.id)
      .eq("thanks_pending", true)
      .select("id");
    if (!claimed?.length) continue;

    const [{ data: settings }, { data: identity }] = await Promise.all([
      admin.from("nps_settings").select("enabled, thanks").eq("organization_id", survey.organization_id).maybeSingle(),
      admin
        .from("contact_identities")
        .select("external_id")
        .eq("organization_id", survey.organization_id)
        .eq("contact_id", survey.contact_id)
        .eq("channel", survey.conversations.channel)
        .limit(1)
        .maybeSingle(),
    ]);
    if (!settings?.thanks || !identity) continue;

    const result = await sendAutomatic(
      admin,
      providerName,
      {
        organizationId: survey.organization_id,
        accountId: survey.conversations.channel_account_id,
        accountExternalId: survey.conversations.channel_accounts.external_account_id,
        conversationId: survey.conversation_id,
        lastOutboundAt: survey.conversations.last_outbound_at,
        channel: survey.conversations.channel,
        to: identity.external_id,
      },
      settings.thanks,
    );
    if (result === "hourly_limit" || !result.ok) logEvent("nps.thanks_not_sent", { surveyId: survey.id }, "warn");
  }
}
