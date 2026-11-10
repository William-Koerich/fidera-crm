"use server";

import { refresh } from "next/cache";
import { requireMembership } from "@/lib/auth";
import { getConversation } from "@/lib/inbox/queries";
import { createAdminClient } from "@/lib/supabase/server";

/** How long "Pausar a IA" keeps it out of one conversation. */
const MANUAL_PAUSE_HOURS = 72;

/**
 * Pauses the AI in one conversation, or gives the conversation back to it. Anyone who can see the
 * conversation may do it; the state is written by the server.
 */
export async function setAiPausedAction(conversationId: string, paused: boolean): Promise<{ ok: boolean }> {
  const me = await requireMembership();
  const conversation = await getConversation(conversationId);
  if (!conversation) return { ok: false };
  const admin = createAdminClient();
  const { error } = await admin.from("ai_conversation_state").upsert(
    {
      conversation_id: conversation.id,
      organization_id: conversation.organizationId,
      paused_until: paused ? new Date(Date.now() + MANUAL_PAUSE_HOURS * 3_600_000).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id" },
  );
  if (error) return { ok: false };
  await admin.from("audit_log").insert({
    organization_id: conversation.organizationId,
    actor_id: me.user.id,
    action: paused ? "ai_agent.paused" : "ai_agent.resumed",
    target_table: "conversations",
    target_id: conversation.id,
    metadata: {},
  });
  refresh();
  return { ok: true };
}
