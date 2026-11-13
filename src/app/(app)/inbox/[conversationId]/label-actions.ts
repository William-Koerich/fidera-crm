"use server";

import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { getConversation } from "@/lib/inbox/queries";
import { changeContactLabel, createLabel, listLabels, type LabelChangeResult } from "@/lib/labels/server";
import { nextLabelColor, type LabelInfo } from "@/lib/labels/stages";
import { cleanItemName } from "@/lib/replies/team-items";

/** Turns a label on or off for this conversation's contact. Any team member can do it. */
export async function toggleLabelAction(conversationId: string, labelId: string, on: boolean): Promise<LabelChangeResult> {
  await requireMembership();
  // Through RLS: only conversations this person can see.
  const conversation = await getConversation(conversationId);
  if (!conversation) return { status: "error", notice: "Conversa não encontrada." };
  const result = await changeContactLabel({ organizationId: conversation.organizationId, contactId: conversation.contact.id, labelId, on });
  if (result.status === "saved") refresh();
  return result;
}

/** Creates a label from the conversation and puts it on the contact. Managers only. */
export async function createLabelHereAction(
  conversationId: string,
  rawName: string,
  asStage: boolean,
): Promise<LabelChangeResult & { label?: LabelInfo }> {
  const me = await requireMembership();
  if (!canManage(me.role)) return { status: "error", notice: "Apenas donos e administradores criam etiquetas." };
  const conversation = await getConversation(conversationId);
  if (!conversation) return { status: "error", notice: "Conversa não encontrada." };
  const name = cleanItemName("labels", rawName);
  if (!name) return { status: "error", notice: "Escreva um nome de até 40 letras." };

  const labels = await listLabels(conversation.organizationId);
  const stages = labels.filter((l) => l.stagePosition !== null);
  const stagePosition = asStage ? Math.min(99, Math.max(-1, ...stages.map((l) => l.stagePosition!)) + 1) : null;
  const color = nextLabelColor(labels.map((l) => l.color));
  const created = await createLabel(conversation.organizationId, { name, color, stagePosition });
  if ("error" in created) return { status: "error", notice: created.error };

  const result = await changeContactLabel({ organizationId: conversation.organizationId, contactId: conversation.contact.id, labelId: created.id, on: true });
  refresh();
  const label = created.existed ? labels.find((l) => l.id === created.id) : { id: created.id, name, color, stagePosition };
  return { ...result, label };
}
