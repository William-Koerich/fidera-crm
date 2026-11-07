"use server";

import { askAssistant, isAssistantEnabled } from "@/lib/ai/assistant";
import { REWRITE_SYSTEM, SUGGEST_SYSTEM, SUMMARY_SYSTEM, buildTranscript, rewritePrompt, suggestPrompt } from "@/lib/ai/prompts";
import { requireMembership } from "@/lib/auth";
import { getConversation } from "@/lib/inbox/queries";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** Each use costs money: a ceiling per business keeps a mistake from running up the bill. */
const MAX_USES_PER_HOUR = 120;

export type AiResult = { ok: true; text: string } | { ok: false; message: string };

const MESSAGES = {
  disabled: "A IA não está ligada neste servidor.",
  declined: "A IA não quis responder a esta conversa. Escreva a mensagem você mesmo.",
  unavailable: "A IA não respondeu agora. Tente de novo em instantes.",
  limit: "O limite de usos da IA por hora foi atingido. Tente de novo mais tarde.",
  notFound: "Conversa não encontrada.",
};

async function prepare(conversationId: string) {
  const me = await requireMembership();
  if (!isAssistantEnabled()) return { error: MESSAGES.disabled } as const;
  // Read under RLS: only conversations this person can open reach the assistant.
  const conversation = await getConversation(conversationId);
  if (!conversation) return { error: MESSAGES.notFound } as const;

  const admin = createAdminClient();
  const { count } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", conversation.organizationId)
    .eq("action", "ai.used")
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= MAX_USES_PER_HOUR) return { error: MESSAGES.limit } as const;

  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("direction, type, body, occurred_at")
    .eq("conversation_id", conversation.id)
    .neq("status", "failed")
    .order("occurred_at", { ascending: false })
    .limit(30);
  const transcript = buildTranscript(
    (data ?? []).reverse().map((m) => ({ direction: m.direction, type: m.type, body: m.body, occurredAt: m.occurred_at })),
  );

  const record = (feature: string) =>
    admin.from("audit_log").insert({
      organization_id: conversation.organizationId,
      actor_id: me.user.id,
      action: "ai.used",
      target_table: "conversations",
      target_id: conversation.id,
      metadata: { feature },
    });
  return { conversation, transcript, record } as const;
}

async function run(conversationId: string, feature: string, system: string, prompt: (transcript: string, clientName: string | null) => string): Promise<AiResult> {
  const ready = await prepare(conversationId);
  if ("error" in ready) return { ok: false, message: ready.error ?? MESSAGES.unavailable };
  if (!ready.transcript) return { ok: false, message: "Ainda não há mensagens nesta conversa." };
  await ready.record(feature);
  const result = await askAssistant(system, prompt(ready.transcript, ready.conversation.contact.name));
  return result.ok ? result : { ok: false, message: MESSAGES[result.reason] };
}

export async function suggestReplyAction(conversationId: string): Promise<AiResult> {
  return run(conversationId, "suggest", SUGGEST_SYSTEM, suggestPrompt);
}

export async function rewriteDraftAction(conversationId: string, draft: string): Promise<AiResult> {
  const text = draft.trim();
  if (!text) return { ok: false, message: "Escreva algo para a IA melhorar." };
  if (text.length > 4000) return { ok: false, message: "Texto longo demais." };
  return run(conversationId, "rewrite", REWRITE_SYSTEM, (transcript) => rewritePrompt(transcript, text));
}

export async function summarizeAction(conversationId: string): Promise<AiResult> {
  return run(conversationId, "summary", SUMMARY_SYSTEM, (transcript) => `<conversa>\n${transcript}\n</conversa>`);
}
