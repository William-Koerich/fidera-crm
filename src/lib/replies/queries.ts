import "server-only";
import { createClient } from "@/lib/supabase/server";
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
