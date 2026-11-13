"use server";

import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { parseCampaignForm, NEW_LABEL_COLOR } from "@/lib/campaigns/config";
import { createLabel } from "@/lib/labels/server";
import { isGreetingAudioPathOf } from "@/lib/replies/greeting-audio";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/webhooks/media";

export interface CampaignFormState {
  status: "idle" | "error" | "saved";
  message?: string;
  savedAt?: number;
}

const fail = (message: string): CampaignFormState => ({ status: "error", message });

async function requireManager() {
  const me = await requireMembership();
  return canManage(me.role) ? me : null;
}

export async function saveCampaignAction(_prev: CampaignFormState, formData: FormData): Promise<CampaignFormState> {
  const me = await requireManager();
  if (!me) return fail("Apenas donos e administradores podem alterar campanhas.");
  const parsed = parseCampaignForm((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
  if (!parsed.ok) return fail(parsed.message);
  const { values } = parsed;
  if (values.replyAudioPath && !isGreetingAudioPathOf(values.replyAudioPath, me.organizationId)) return fail("Grave ou escolha o áudio de novo.");

  const supabase = await createClient();
  let labelId = values.labelId;
  if (labelId) {
    const { data } = await supabase.from("labels").select("id").eq("organization_id", me.organizationId).eq("id", labelId).maybeSingle();
    if (!data) return fail("Essa etiqueta não existe mais. Escolha outra.");
  } else if (values.newLabelName) {
    const created = await createLabel(me.organizationId, { name: values.newLabelName, color: NEW_LABEL_COLOR });
    if ("error" in created) return fail(created.error);
    labelId = created.id;
  }

  const id = String(formData.get("id") ?? "") || null;
  const row = {
    organization_id: me.organizationId,
    name: values.name,
    trigger_text: values.triggerText,
    label_id: labelId,
    reply_format: values.replyFormat,
    reply_text: values.replyText,
    reply_audio_path: values.replyAudioPath,
    enabled: values.enabled,
  };
  let previousAudio: string | null = null;
  if (id) {
    const { data: previous } = await supabase.from("campaigns").select("reply_audio_path").eq("id", id).eq("organization_id", me.organizationId).maybeSingle();
    if (!previous) return fail("Campanha não encontrada.");
    previousAudio = previous.reply_audio_path;
    const { error } = await supabase.from("campaigns").update(row).eq("id", id).eq("organization_id", me.organizationId);
    if (error) return fail("Não foi possível salvar. Tente de novo.");
  } else {
    const { error } = await supabase.from("campaigns").insert(row);
    if (error) return fail("Não foi possível salvar. Tente de novo.");
  }

  const admin = createAdminClient();
  if (previousAudio && previousAudio !== values.replyAudioPath && isGreetingAudioPathOf(previousAudio, me.organizationId)) {
    await admin.storage.from(MEDIA_BUCKET).remove([previousAudio]);
  }
  await admin.from("audit_log").insert({
    organization_id: me.organizationId,
    actor_id: me.user.id,
    action: id ? "campaign.updated" : "campaign.created",
    metadata: { name: values.name, reply: values.replyFormat, enabled: values.enabled },
  });
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function deleteCampaignAction(id: string): Promise<{ ok: boolean }> {
  const me = await requireManager();
  if (!me) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").delete().eq("id", id).eq("organization_id", me.organizationId).select("reply_audio_path");
  if (!data?.length) return { ok: false };
  const audio = data[0]!.reply_audio_path;
  const admin = createAdminClient();
  if (audio && isGreetingAudioPathOf(audio, me.organizationId)) await admin.storage.from(MEDIA_BUCKET).remove([audio]);
  await admin.from("audit_log").insert({ organization_id: me.organizationId, actor_id: me.user.id, action: "campaign.deleted", metadata: { id } });
  refresh();
  return { ok: true };
}

/** For the confirmation dialog, which submits a form. */
export async function deleteCampaignFormAction(formData: FormData): Promise<void> {
  await deleteCampaignAction(String(formData.get("id") ?? ""));
}
