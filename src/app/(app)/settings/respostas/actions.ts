"use server";

import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { parseAutoReplyForm } from "@/lib/replies/auto-reply";
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

  const supabase = await createClient();
  const { error } = await supabase.from("auto_reply_settings").upsert({
    organization_id: me.organizationId,
    greeting_enabled: settings.greetingEnabled,
    greeting_text: settings.greetingText,
    away_enabled: settings.awayEnabled,
    away_text: settings.awayText,
    business_hours: settings.businessHours as unknown as Json,
  });
  if (error) return fail("Não foi possível salvar. Tente de novo.");

  await createAdminClient().from("audit_log").insert({
    organization_id: me.organizationId,
    actor_id: me.user.id,
    action: "auto_replies.updated",
    metadata: { greeting_enabled: settings.greetingEnabled, away_enabled: settings.awayEnabled },
  });
  refresh();
  return { status: "saved", savedAt: Date.now() };
}
