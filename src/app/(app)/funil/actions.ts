"use server";

import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { changeContactLabel, createLabel, listLabels, type LabelChangeResult } from "@/lib/labels/server";
import { SUGGESTED_STAGES, isStage, nextLabelColor, reorderStages } from "@/lib/labels/stages";
import { cleanItemName } from "@/lib/replies/team-items";
import { createClient } from "@/lib/supabase/server";

export interface StageActionState {
  status: "idle" | "saved" | "error";
  message?: string;
}

const fail = (message: string): StageActionState => ({ status: "error", message });

/** Puts a contact in a stage, or takes it out of the funnel (`stageId` null). Any team member. */
export async function moveContactAction(contactId: string, stageId: string | null): Promise<LabelChangeResult> {
  const me = await requireMembership();
  const supabase = await createClient();
  const { data: contact } = await supabase.from("contacts").select("id").eq("organization_id", me.organizationId).eq("id", contactId).maybeSingle();
  if (!contact) return { status: "error", notice: "Contato não encontrado." };

  let result: LabelChangeResult;
  if (stageId) {
    result = await changeContactLabel({ organizationId: me.organizationId, contactId, labelId: stageId, on: true });
  } else {
    const stages = (await listLabels(me.organizationId)).filter(isStage);
    const { data: current } = await supabase.from("contact_labels").select("label_id").eq("contact_id", contactId);
    result = { status: "saved" };
    for (const stage of stages.filter((s) => current?.some((c) => c.label_id === s.id))) {
      result = await changeContactLabel({ organizationId: me.organizationId, contactId, labelId: stage.id, on: false });
      if (result.status === "error") break;
    }
  }
  if (result.status === "saved") refresh();
  return result;
}

async function manager() {
  const me = await requireMembership();
  return canManage(me.role) ? me : null;
}

async function savePositions(organizationId: string, orderedIds: string[]) {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, position) => supabase.from("labels").update({ stage_position: position }).eq("organization_id", organizationId).eq("id", id)),
  );
  return !results.some((r) => r.error);
}

/** Starts a salon's funnel with the usual stages; labels with the same name become stages. */
export async function createSuggestedStagesAction(): Promise<StageActionState> {
  const me = await manager();
  if (!me) return fail("Apenas donos e administradores mudam o funil.");
  const labels = await listLabels(me.organizationId);
  const ids: string[] = labels.filter(isStage).map((l) => l.id);
  for (const suggestion of SUGGESTED_STAGES) {
    const same = labels.find((l) => l.name.toLowerCase() === suggestion.name.toLowerCase());
    if (same) {
      if (!ids.includes(same.id)) ids.push(same.id);
      continue;
    }
    const created = await createLabel(me.organizationId, { name: suggestion.name, color: suggestion.color, stagePosition: ids.length });
    if ("error" in created) return fail(created.error);
    ids.push(created.id);
  }
  if (!(await savePositions(me.organizationId, ids))) return fail("Não foi possível salvar. Tente de novo.");
  refresh();
  return { status: "saved" };
}

/** Adds a stage at the end: an existing label, or a new one by name. */
export async function addStageAction(_prev: StageActionState, formData: FormData): Promise<StageActionState> {
  const me = await manager();
  if (!me) return fail("Apenas donos e administradores mudam o funil.");
  const labels = await listLabels(me.organizationId);
  const ids = labels.filter(isStage).map((l) => l.id);
  if (ids.length >= 12) return fail("O funil pode ter até 12 etapas.");

  const existingId = String(formData.get("label_id") ?? "");
  if (existingId) {
    const label = labels.find((l) => l.id === existingId && !isStage(l));
    if (!label) return fail("Essa etiqueta não existe mais.");
    ids.push(label.id);
  } else {
    const name = cleanItemName("labels", String(formData.get("name") ?? ""));
    if (!name) return fail("Escreva o nome da etapa, com até 40 letras.");
    const created = await createLabel(me.organizationId, { name, color: nextLabelColor(labels.map((l) => l.color)), stagePosition: ids.length });
    if ("error" in created) return fail(created.error);
    if (ids.includes(created.id)) return fail(`"${name}" já é uma etapa.`);
    ids.push(created.id);
  }
  if (!(await savePositions(me.organizationId, ids))) return fail("Não foi possível salvar. Tente de novo.");
  refresh();
  return { status: "saved" };
}

export async function moveStageAction(labelId: string, direction: -1 | 1): Promise<StageActionState> {
  const me = await manager();
  if (!me) return fail("Apenas donos e administradores mudam o funil.");
  const ids = (await listLabels(me.organizationId)).filter(isStage).map((l) => l.id);
  if (!(await savePositions(me.organizationId, reorderStages(ids, labelId, direction)))) return fail("Não foi possível salvar.");
  refresh();
  return { status: "saved" };
}

/** The label stays (and stays on the contacts); it just stops being a column of the funnel. */
export async function removeStageAction(labelId: string): Promise<StageActionState> {
  const me = await manager();
  if (!me) return fail("Apenas donos e administradores mudam o funil.");
  const supabase = await createClient();
  const { error } = await supabase.from("labels").update({ stage_position: null }).eq("organization_id", me.organizationId).eq("id", labelId);
  if (error) return fail("Não foi possível salvar.");
  const rest = (await listLabels(me.organizationId)).filter(isStage).map((l) => l.id);
  await savePositions(me.organizationId, rest);
  refresh();
  return { status: "saved" };
}
