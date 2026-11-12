"use server";

import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { parseAutoReplyForm } from "@/lib/replies/auto-reply";
import { isGreetingAudioPathOf } from "@/lib/replies/greeting-audio";
import { MEDIA_BUCKET } from "@/lib/webhooks/media";
import { parseBotForm } from "@/lib/bot/config";
import { parseNpsForm } from "@/lib/replies/nps";
import { MAX_REPLY_LENGTH, normalizeShortcut } from "@/lib/replies/quick-replies";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export interface ReplyFormState {
  status: "idle" | "error" | "saved";
  message?: string;
  /** Changes on every save so the client can clear or close the form. */
  savedAt?: number;
}

const fail = (message: string): ReplyFormState => ({ status: "error", message });

async function requireManager() {
  const me = await requireMembership();
  return canManage(me.role) ? me : null;
}

export async function saveQuickReplyAction(_prev: ReplyFormState, formData: FormData): Promise<ReplyFormState> {
  const me = await requireManager();
  if (!me) return fail("Apenas donos e administradores podem alterar respostas.");

  const shortcut = normalizeShortcut(String(formData.get("shortcut") ?? ""));
  if (!shortcut) return fail("Use até 30 letras, números ou hífens no atalho.");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return fail("Escreva o texto da resposta.");
  if (body.length > MAX_REPLY_LENGTH) return fail("Texto longo demais.");

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("quick_replies").update({ shortcut, body }).eq("id", id).eq("organization_id", me.organizationId)
    : await supabase.from("quick_replies").insert({ organization_id: me.organizationId, shortcut, body });
  if (error?.code === "23505") return fail(`O atalho /${shortcut} já existe.`);
  if (error) return fail("Não foi possível salvar. Tente de novo.");
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function deleteQuickReplyAction(formData: FormData): Promise<void> {
  const me = await requireManager();
  if (!me) return;
  const supabase = await createClient();
  await supabase
    .from("quick_replies")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", me.organizationId);
  refresh();
}

export async function saveAutoRepliesAction(_prev: ReplyFormState, formData: FormData): Promise<ReplyFormState> {
  const me = await requireManager();
  if (!me) return fail("Apenas donos e administradores podem alterar respostas.");

  const parsed = parseAutoReplyForm((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
  if (!parsed.ok) return fail(parsed.message);
  const { settings } = parsed;
  if (settings.greetingAudioPath && !isGreetingAudioPathOf(settings.greetingAudioPath, me.organizationId)) {
    return fail("Grave ou escolha o áudio de novo.");
  }

  const supabase = await createClient();
  const { data: previous } = await supabase
    .from("auto_reply_settings")
    .select("greeting_audio_path")
    .eq("organization_id", me.organizationId)
    .maybeSingle();
  const { error } = await supabase.from("auto_reply_settings").upsert({
    organization_id: me.organizationId,
    greeting_enabled: settings.greetingEnabled,
    greeting_format: settings.greetingFormat,
    greeting_audio_path: settings.greetingAudioPath,
    greeting_text: settings.greetingText,
    away_enabled: settings.awayEnabled,
    away_text: settings.awayText,
    business_hours: settings.businessHours as unknown as Json,
  });
  if (error) return fail("Não foi possível salvar. Tente de novo.");

  const admin = createAdminClient();
  // A replaced or removed recording is not needed anymore.
  const old = previous?.greeting_audio_path;
  if (old && old !== settings.greetingAudioPath && isGreetingAudioPathOf(old, me.organizationId)) {
    await admin.storage.from(MEDIA_BUCKET).remove([old]);
  }
  await admin.from("audit_log").insert({
    organization_id: me.organizationId,
    actor_id: me.user.id,
    action: "auto_replies.updated",
    metadata: { greeting_enabled: settings.greetingEnabled, greeting_format: settings.greetingFormat, away_enabled: settings.awayEnabled },
  });
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function saveNpsAction(_prev: ReplyFormState, formData: FormData): Promise<ReplyFormState> {
  const me = await requireManager();
  if (!me) return fail("Apenas donos e administradores podem alterar isto.");
  const parsed = parseNpsForm((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
  if (!parsed.ok) return fail(parsed.message);

  const supabase = await createClient();
  const { error } = await supabase.from("nps_settings").upsert({
    organization_id: me.organizationId,
    enabled: parsed.enabled,
    question: parsed.question,
    thanks: parsed.thanks,
  });
  if (error) return fail("Não foi possível salvar. Tente de novo.");
  await createAdminClient().from("audit_log").insert({
    organization_id: me.organizationId,
    actor_id: me.user.id,
    action: "nps.updated",
    metadata: { enabled: parsed.enabled },
  });
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function saveBotAction(_prev: ReplyFormState, formData: FormData): Promise<ReplyFormState> {
  const me = await requireManager();
  if (!me) return fail("Apenas donos e administradores podem alterar isto.");
  const parsed = parseBotForm((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
  if (!parsed.ok) return fail(parsed.message);
  const { settings } = parsed;

  const supabase = await createClient();
  const [{ data: departments }, { data: members }] = await Promise.all([
    supabase.from("departments").select("id").eq("organization_id", me.organizationId),
    supabase.from("memberships").select("user_id").eq("organization_id", me.organizationId),
  ]);
  const validDepartments = new Set((departments ?? []).map((d) => d.id));
  const options = settings.options.map((o) => ({ ...o, departmentId: o.departmentId && validDepartments.has(o.departmentId) ? o.departmentId : null }));

  const { error } = await supabase.from("bot_settings").upsert({
    organization_id: me.organizationId,
    enabled: settings.enabled,
    welcome: settings.welcome,
    handoff_text: settings.handoffText,
    options: options as unknown as Json,
  });
  if (error) return fail("Não foi possível salvar. Tente de novo.");

  // Server client after the checks above: admins may not edit an owner's membership under RLS.
  const bookable = new Set(formData.getAll("bookable").map(String));
  const admin = createAdminClient();
  for (const member of members ?? []) {
    await admin
      .from("memberships")
      .update({ bookable: bookable.has(member.user_id) })
      .eq("organization_id", me.organizationId)
      .eq("user_id", member.user_id);
  }
  await admin.from("audit_log").insert({
    organization_id: me.organizationId,
    actor_id: me.user.id,
    action: "bot.updated",
    metadata: { enabled: settings.enabled },
  });
  refresh();
  return { status: "saved", savedAt: Date.now() };
}
