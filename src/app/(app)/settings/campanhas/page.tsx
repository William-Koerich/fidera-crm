import type { Metadata } from "next";
import { canManage, requireMembership } from "@/lib/auth";
import type { CampaignReplyFormat } from "@/lib/campaigns/config";
import { isGreetingAudioPathOf } from "@/lib/replies/greeting-audio";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/webhooks/media";
import { ManagersOnly, SettingsPage } from "../settings-page";
import { CampaignsManager, type CampaignItem } from "./campaigns-manager";

export const metadata: Metadata = { title: "Campanhas" };

export default function Page() {
  return (
    <SettingsPage
      title="Campanhas"
      description="Reconheça quem veio de cada anúncio ou post pela mensagem pronta que ele envia. O contato ganha a etiqueta da campanha e, se você quiser, uma resposta só dela."
    >
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  if (!canManage(me.role)) return <ManagersOnly />;
  const supabase = await createClient();
  const [campaigns, labels, contacts] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, trigger_text, label_id, reply_format, reply_text, reply_audio_path, enabled")
      .eq("organization_id", me.organizationId)
      .order("created_at", { ascending: false }),
    supabase.from("labels").select("id, name, color").eq("organization_id", me.organizationId).order("name"),
    supabase.from("campaign_contacts").select("campaign_id").eq("organization_id", me.organizationId),
  ]);
  const counts = new Map<string, number>();
  for (const row of contacts.data ?? []) counts.set(row.campaign_id, (counts.get(row.campaign_id) ?? 0) + 1);
  const labelOf = new Map((labels.data ?? []).map((l) => [l.id, l]));

  // Recordings are private: the page gets short-lived addresses to play them.
  const audioPaths = (campaigns.data ?? []).map((c) => c.reply_audio_path).filter((p): p is string => !!p && isGreetingAudioPathOf(p, me.organizationId));
  const signed = new Map<string, string>();
  if (audioPaths.length) {
    const { data } = await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUrls(audioPaths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  const items: CampaignItem[] = (campaigns.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    triggerText: c.trigger_text,
    labelId: c.label_id,
    labelName: c.label_id ? (labelOf.get(c.label_id)?.name ?? null) : null,
    labelColor: c.label_id ? (labelOf.get(c.label_id)?.color ?? null) : null,
    replyFormat: c.reply_format as CampaignReplyFormat,
    replyText: c.reply_text,
    replyAudioPath: c.reply_audio_path,
    replyAudioUrl: c.reply_audio_path ? (signed.get(c.reply_audio_path) ?? null) : null,
    enabled: c.enabled,
    contacts: counts.get(c.id) ?? 0,
  }));

  return <CampaignsManager campaigns={items} labels={labels.data ?? []} />;
}
