"use server";

import { refresh } from "next/cache";
import { requireMembership } from "@/lib/auth";
import { getProviderByName } from "@/lib/channels";
import { getConversation, listTeamMembers } from "@/lib/inbox/queries";
import { logEvent } from "@/lib/log";
import { createAttachmentUpload, sendAttachment, sendReply } from "@/lib/inbox/send";
import { createAdminClient, createClient } from "@/lib/supabase/server";

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

export interface AssignState {
  status: "saved" | "error";
  /** Shown when the CRM saved it but the channel's own system did not follow. */
  notice?: string;
}

/** Sets who is responsible. The team list comes from the server, so only members can be chosen. */
export async function assignConversationAction(conversationId: string, assigneeId: string): Promise<AssignState> {
  const me = await requireMembership();
  const conversation = await getConversation(conversationId);
  if (!conversation) return { status: "error", notice: "Conversa não encontrada." };
  const assignee = assigneeId ? (await listTeamMembers(conversation.organizationId)).find((m) => m.id === assigneeId) : null;
  if (assigneeId && !assignee) return { status: "error", notice: "Esta pessoa não faz parte da equipe." };

  const supabase = await createClient();
  const { error } = await supabase.from("conversations").update({ assigned_to: assignee?.id ?? null }).eq("id", conversation.id);
  if (error) return { status: "error", notice: "Não foi possível salvar. Tente de novo." };
  await createAdminClient().from("audit_log").insert({
    organization_id: conversation.organizationId,
    actor_id: me.user.id,
    action: assignee ? "conversation.assigned" : "conversation.unassigned",
    target_table: "conversations",
    target_id: conversation.id,
    metadata: assignee ? { assigned_to: assignee.id } : {},
  });
  refresh();

  const provider = getProviderByName(conversation.account.provider);
  if (!provider.assignConversation) return { status: "saved" };
  if (!assignee) return { status: "saved", notice: "Removido aqui no Fidera. No ChatPro, a atribuição anterior continua." };
  if (!conversation.recipientExternalId) return { status: "saved" };

  const mirrored = await provider.assignConversation({
    accountExternalId: conversation.account.externalAccountId,
    to: conversation.recipientExternalId,
    assigneeEmail: assignee.email,
  });
  if (mirrored === "assigned") return { status: "saved" };
  logEvent("conversation.assign_not_mirrored", { conversationId: conversation.id, result: mirrored }, "warn");
  return {
    status: "saved",
    notice:
      mirrored === "no_matching_user"
        ? "Salvo no Fidera. No ChatPro não há usuário com este e-mail, então lá não mudou."
        : "Salvo no Fidera, mas o ChatPro não confirmou a atribuição.",
  };
}

export async function markReadAction(conversationId: string): Promise<void> {
  await requireMembership();
  const supabase = await createClient();
  await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId).gt("unread_count", 0);
}
