import "server-only";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { AutoReplySettings } from "./auto-reply";
import { toAutoReplySettings } from "./auto-reply-store";
import type { QuickReply } from "./quick-replies";

export async function listQuickReplies(organizationId: string): Promise<QuickReply[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quick_replies")
    .select("id, shortcut, body")
    .eq("organization_id", organizationId)
    .order("shortcut");
  if (error) throw new Error(`Could not load quick replies (${error.code})`);
  return data;
}

export async function getAutoReplySettings(organizationId: string): Promise<AutoReplySettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("auto_reply_settings").select("*").eq("organization_id", organizationId).maybeSingle();
  if (error) throw new Error(`Could not load automatic replies (${error.code})`);
  return toAutoReplySettings(data);
}

export async function getNpsSettings(organizationId: string): Promise<{ enabled: boolean; question: string; thanks: string }> {
  const supabase = await createClient();
  const { data } = await supabase.from("nps_settings").select("enabled, question, thanks").eq("organization_id", organizationId).maybeSingle();
  return { enabled: data?.enabled ?? false, question: data?.question ?? "", thanks: data?.thanks ?? "" };
}

/** Members may finish conversations too, but cannot read these settings under RLS. */
export async function isRatingEnabled(organizationId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("nps_settings").select("enabled").eq("organization_id", organizationId).maybeSingle();
  return data?.enabled ?? false;
}

export async function getBotSettings(organizationId: string): Promise<{
  settings: import("@/lib/bot/config").BotSettings;
  members: { id: string; email: string; name: string | null; bookable: boolean }[];
  hasBusinessHours: boolean;
  serviceCount: number;
}> {
  const supabase = await createClient();
  const [bot, memberships, team, autoReply, services] = await Promise.all([
    supabase.from("bot_settings").select("*").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("memberships").select("user_id, bookable").eq("organization_id", organizationId),
    supabase.rpc("list_members", { org_id: organizationId }),
    supabase.from("auto_reply_settings").select("business_hours").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);
  const bookable = new Map((memberships.data ?? []).map((m) => [m.user_id, m.bookable]));
  return {
    settings: {
      enabled: bot.data?.enabled ?? false,
      welcome: bot.data?.welcome ?? "",
      handoffText: bot.data?.handoff_text ?? "",
      options: (bot.data?.options ?? []) as unknown as import("@/lib/bot/config").BotSettings["options"],
    },
    members: (team.data ?? []).map((m) => ({ id: m.user_id, email: m.email, name: m.display_name ?? null, bookable: bookable.get(m.user_id) ?? true })),
    hasBusinessHours: Object.keys((autoReply.data?.business_hours ?? {}) as object).length > 0,
    serviceCount: services.count ?? 0,
  };
}
