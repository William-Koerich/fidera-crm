"use server";

import { refresh } from "next/cache";
import { requireMembership } from "@/lib/auth";
import { getConversation } from "@/lib/inbox/queries";
import { sendReply } from "@/lib/inbox/send";
import { createClient } from "@/lib/supabase/server";

export interface ComposerState {
  status: "idle" | "error" | "sent";
  message?: string;
  /** Changes on every successful send so the client can clear the textarea. */
  sentAt?: number;
}

const REASONS: Record<string, string> = {
  empty: "Escreva uma mensagem.",
  too_long: "Mensagem longa demais.",
  window_closed: "A janela de 24h fechou. Use o botão para abrir no WhatsApp.",
  account_unavailable: "O canal está desconectado. Reconecte em Ajustes.",
  no_recipient: "Não encontramos o identificador do contato neste canal.",
  provider_error: "O envio falhou. Tente de novo.",
};

export async function sendReplyAction(_prev: ComposerState, formData: FormData): Promise<ComposerState> {
  const me = await requireMembership();
  const conversation = await getConversation(String(formData.get("conversationId") ?? ""));
  if (!conversation) return { status: "error", message: "Conversa não encontrada." };

  const result = await sendReply({ conversation, body: String(formData.get("body") ?? ""), userId: me.user.id });
  if (!result.ok) return { status: "error", message: REASONS[result.reason] };
  refresh();
  return { status: "sent", sentAt: Date.now() };
}

export async function markReadAction(conversationId: string): Promise<void> {
  await requireMembership();
  const supabase = await createClient();
  await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId).gt("unread_count", 0);
}
