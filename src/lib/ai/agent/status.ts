import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { isAssistantEnabled } from "../assistant";

export interface ConversationAiStatus {
  pausedUntil: string | null;
  teamQuietUntil: string | null;
}

/**
 * For a conversation the person already can see: null when the AI attendant is off for the business.
 * Read with the server client because members do not read the business's AI settings.
 */
export async function getConversationAiStatus(organizationId: string, conversationId: string): Promise<ConversationAiStatus | null> {
  if (!isAssistantEnabled()) return null;
  const admin = createAdminClient();
  const [settings, state, team] = await Promise.all([
    admin.from("ai_agent_settings").select("enabled, pause_after_team_hours").eq("organization_id", organizationId).maybeSingle(),
    admin.from("ai_conversation_state").select("paused_until").eq("conversation_id", conversationId).maybeSingle(),
    admin
      .from("messages")
      .select("occurred_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .in("origin", ["api", "business_app_echo"])
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!settings.data?.enabled) return null;
  const now = Date.now();
  const paused = state.data?.paused_until && Date.parse(state.data.paused_until) > now ? state.data.paused_until : null;
  const quietUntil = team.data ? Date.parse(team.data.occurred_at) + settings.data.pause_after_team_hours * 3_600_000 : 0;
  return { pausedUntil: paused, teamQuietUntil: quietUntil > now ? new Date(quietUntil).toISOString() : null };
}
