"use server";

import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { getProviderByName } from "@/lib/channels";
import { getConversation, listInboxOptions, listTeamMembers } from "@/lib/inbox/queries";
import { logEvent } from "@/lib/log";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** The CRM is the record. `notice` says when the channel's own system did not follow. */
export interface TeamActionState {
  status: "saved" | "error";
  notice?: string;
}

const NOT_MIRRORED = "Salvo no Fidera, mas o ChatPro não confirmou.";
const error = (notice: string): TeamActionState => ({ status: "error", notice });

async function load(conversationId: string) {
  const me = await requireMembership();
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;
  const provider = getProviderByName(conversation.account.provider);
  return {
    me,
    conversation,
    sync: provider.team ?? null,
    instanceId: conversation.account.externalAccountId,
    to: conversation.recipientExternalId,
  };
}

async function audit(organizationId: string, actorId: string, action: string, conversationId: string, metadata = {}) {
  await createAdminClient().from("audit_log").insert({
    organization_id: organizationId,
    actor_id: actorId,
    action,
    target_table: "conversations",
    target_id: conversationId,
    metadata,
  });
}

function mirrored(ok: boolean, what: string, conversationId: string): TeamActionState {
  if (ok) return { status: "saved" };
  logEvent("team.not_mirrored", { what, conversationId }, "warn");
  return { status: "saved", notice: NOT_MIRRORED };
}

export async function setDepartmentAction(conversationId: string, departmentId: string): Promise<TeamActionState> {
  const ctx = await load(conversationId);
  if (!ctx) return error("Conversa não encontrada.");
  const { conversation } = ctx;
  const { departments } = await listInboxOptions(conversation.organizationId);
  const department = departmentId ? departments.find((d) => d.id === departmentId) : null;
  if (departmentId && !department) return error("Departamento não encontrado.");

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("conversations")
    .update({ department_id: department?.id ?? null })
    .eq("id", conversation.id);
  if (updateError) return error("Não foi possível salvar. Tente de novo.");
  refresh();

  if (!ctx.sync) return { status: "saved" };
  if (!department) return { status: "saved", notice: "Removido aqui no Fidera. No ChatPro, o departamento anterior continua." };
  if (!department.externalId || !ctx.to) return { status: "saved", notice: "Salvo no Fidera. Este departamento não existe no ChatPro." };
  return mirrored(
    await ctx.sync.assignDepartment({ accountExternalId: ctx.instanceId, to: ctx.to, departmentExternalId: department.externalId }),
    "department",
    conversation.id,
  );
}

export async function setContactLabelAction(conversationId: string, labelId: string, on: boolean): Promise<TeamActionState> {
  const ctx = await load(conversationId);
  if (!ctx) return error("Conversa não encontrada.");
  const { conversation } = ctx;
  const { labels } = await listInboxOptions(conversation.organizationId);
  const label = labels.find((l) => l.id === labelId);
  if (!label) return error("Etiqueta não encontrada.");

  const supabase = await createClient();
  const { error: writeError } = on
    ? await supabase.from("contact_labels").upsert({
        organization_id: conversation.organizationId,
        contact_id: conversation.contact.id,
        label_id: label.id,
      })
    : await supabase.from("contact_labels").delete().eq("contact_id", conversation.contact.id).eq("label_id", label.id);
  if (writeError) return error("Não foi possível salvar. Tente de novo.");
  refresh();

  if (!ctx.sync) return { status: "saved" };
  if (!label.externalId || !ctx.to) return { status: "saved", notice: "Salvo no Fidera. Esta etiqueta não existe no ChatPro." };
  return mirrored(
    await ctx.sync.setContactLabel({ accountExternalId: ctx.instanceId, to: ctx.to, labelExternalId: label.externalId, on }),
    "label",
    conversation.id,
  );
}

/** Who this client belongs to. Managers only: it decides where the client's conversations go. */
export async function setContactOwnerAction(conversationId: string, ownerId: string): Promise<TeamActionState> {
  const ctx = await load(conversationId);
  if (!ctx) return error("Conversa não encontrada.");
  const { conversation, me } = ctx;
  if (!canManage(me.role)) return error("Apenas donos e administradores podem mudar o dono do cliente.");
  const owner = ownerId ? (await listTeamMembers(conversation.organizationId)).find((m) => m.id === ownerId) : null;
  if (ownerId && !owner) return error("Esta pessoa não faz parte da equipe.");

  const supabase = await createClient();
  const { error: updateError } = await supabase.from("contacts").update({ owner_id: owner?.id ?? null }).eq("id", conversation.contact.id);
  if (updateError) return error("Não foi possível salvar. Tente de novo.");
  await audit(conversation.organizationId, me.user.id, "contact.owner_changed", conversation.id, { owner_id: owner?.id ?? null });
  refresh();

  if (!ctx.sync) return { status: "saved" };
  if (!owner) return { status: "saved", notice: "Removido aqui no Fidera. No ChatPro, o dono anterior continua." };
  if (!ctx.to) return { status: "saved" };
  const result = await ctx.sync.setContactOwner({ accountExternalId: ctx.instanceId, to: ctx.to, ownerEmail: owner.email });
  if (result === "assigned") return { status: "saved" };
  if (result === "no_matching_user") return { status: "saved", notice: "Salvo no Fidera. No ChatPro não há usuário com este e-mail." };
  return mirrored(false, "owner", conversation.id);
}

export async function finishConversationAction(conversationId: string, endingId: string): Promise<TeamActionState> {
  const ctx = await load(conversationId);
  if (!ctx) return error("Conversa não encontrada.");
  const { conversation, me } = ctx;
  const { endings } = await listInboxOptions(conversation.organizationId);
  const ending = endingId ? endings.find((e) => e.id === endingId) : null;
  if (endingId && !ending) return error("Motivo não encontrado.");

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("conversations")
    .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: me.user.id, ending_id: ending?.id ?? null })
    .eq("id", conversation.id);
  if (updateError) return error("Não foi possível finalizar. Tente de novo.");
  await audit(conversation.organizationId, me.user.id, "conversation.finished", conversation.id, { ending_id: ending?.id ?? null });
  refresh();

  if (!ctx.sync) return { status: "saved" };
  if (!ending?.externalId || !ctx.to) {
    return { status: "saved", notice: "Finalizada no Fidera. Para encerrar também no ChatPro, escolha um motivo que exista lá." };
  }
  return mirrored(
    await ctx.sync.finishConversation({ accountExternalId: ctx.instanceId, to: ctx.to, endingExternalId: ending.externalId }),
    "finish",
    conversation.id,
  );
}

export async function reopenConversationAction(conversationId: string): Promise<TeamActionState> {
  const ctx = await load(conversationId);
  if (!ctx) return error("Conversa não encontrada.");
  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("conversations")
    .update({ status: "open", closed_at: null, closed_by: null, ending_id: null })
    .eq("id", ctx.conversation.id);
  if (updateError) return error("Não foi possível reabrir. Tente de novo.");
  await audit(ctx.conversation.organizationId, ctx.me.user.id, "conversation.reopened", ctx.conversation.id);
  refresh();
  return { status: "saved" };
}

export async function addNoteAction(conversationId: string, rawBody: string): Promise<TeamActionState> {
  const ctx = await load(conversationId);
  if (!ctx) return error("Conversa não encontrada.");
  const body = rawBody.trim();
  if (!body) return error("Escreva a nota.");
  if (body.length > 4096) return error("Nota longa demais.");

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("conversation_notes").insert({
    organization_id: ctx.conversation.organizationId,
    conversation_id: ctx.conversation.id,
    author_id: ctx.me.user.id,
    body,
  });
  if (insertError) return error("Não foi possível salvar a nota. Tente de novo.");
  refresh();

  if (!ctx.sync || !ctx.to) return { status: "saved" };
  return mirrored(
    await ctx.sync.addNote({ accountExternalId: ctx.instanceId, to: ctx.to, body, authorEmail: ctx.me.user.email ?? null }),
    "note",
    ctx.conversation.id,
  );
}
