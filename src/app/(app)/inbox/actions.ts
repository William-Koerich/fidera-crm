"use server";

import { refresh } from "next/cache";
import { requireMembership } from "@/lib/auth";
import { getConversation } from "@/lib/inbox/queries";
import { createAttachmentUpload, sendAttachment, sendReply } from "@/lib/inbox/send";
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
  invalid_file: "Não foi possível usar este arquivo. Escolha outro.",
};

const UPLOAD_PROBLEMS: Record<string, string> = {
  unsupported: "Este tipo de arquivo não é aceito. Envie imagem, áudio, vídeo MP4, PDF, Word, Excel ou texto.",
  too_large: "O arquivo passa de 16 MB. Escolha um menor.",
  empty: "Este arquivo está vazio.",
  not_available: "Este canal não envia arquivos.",
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

export type AttachmentUploadState =
  | { status: "ready"; path: string; token: string }
  | { status: "error"; message: string };

export async function prepareAttachmentAction(
  conversationId: string,
  file: { mimeType: string; size: number },
): Promise<AttachmentUploadState> {
  await requireMembership();
  const conversation = await getConversation(conversationId);
  if (!conversation) return { status: "error", message: "Conversa não encontrada." };
  const upload = await createAttachmentUpload(conversation, file);
  if (!upload.ok) return { status: "error", message: UPLOAD_PROBLEMS[upload.reason]! };
  return { status: "ready", path: upload.path, token: upload.token };
}

export async function sendAttachmentAction(input: { conversationId: string; path: string; caption: string }): Promise<ComposerState> {
  const me = await requireMembership();
  const conversation = await getConversation(input.conversationId);
  if (!conversation) return { status: "error", message: "Conversa não encontrada." };

  const result = await sendAttachment({ conversation, path: input.path, caption: input.caption, userId: me.user.id });
  if (!result.ok) return { status: "error", message: REASONS[result.reason] };
  refresh();
  return { status: "sent", sentAt: Date.now() };
}

export async function markReadAction(conversationId: string): Promise<void> {
  await requireMembership();
  const supabase = await createClient();
  await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId).gt("unread_count", 0);
}
