"use server";

import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { getProviderByName } from "@/lib/channels";
import type { ChannelTeamSync } from "@/lib/channels/types";
import { parseBusinessHours, type BusinessHours } from "@/lib/replies/auto-reply";
import { MEMBER_VISIBILITIES } from "@/lib/inbox/queries";
import { cleanItemName, cleanLabelColor, isTeamItemKind, planImport, type TeamItemKind } from "@/lib/replies/team-items";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export interface TeamItemState {
  status: "idle" | "saved" | "error";
  message?: string;
  savedAt?: number;
}

const TABLE = { endings: "ending_reasons", departments: "departments", labels: "labels" } as const;
const fail = (message: string): TeamItemState => ({ status: "error", message });

/** The channel this business mirrors to, when its provider supports it. */
async function channelSync(organizationId: string): Promise<{ sync: ChannelTeamSync; instanceId: string } | null> {
  const { data: accounts } = await createAdminClient()
    .from("channel_accounts")
    .select("provider, external_account_id")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  for (const account of accounts ?? []) {
    const sync = getProviderByName(account.provider).team;
    if (sync) return { sync, instanceId: account.external_account_id };
  }
  return null;
}

export async function createTeamItemAction(_prev: TeamItemState, formData: FormData): Promise<TeamItemState> {
  const me = await requireMembership();
  if (!canManage(me.role)) return fail("Apenas donos e administradores podem alterar isto.");
  const kind = formData.get("kind");
  if (!isTeamItemKind(kind)) return fail("Tipo inválido.");
  const name = cleanItemName(kind, String(formData.get("name") ?? ""));
  if (!name) return fail("Escreva um nome mais curto.");
  const color = kind === "labels" ? cleanLabelColor(String(formData.get("color") ?? "")) : null;
  if (kind === "labels" && !color) return fail("Escolha uma cor.");

  const supabase = await createClient();
  const base = { organization_id: me.organizationId, name };
  const { data: row, error } =
    kind === "labels"
      ? await supabase.from("labels").insert({ ...base, color: color! }).select("id").single()
      : await supabase.from(TABLE[kind]).insert(base).select("id").single();
  if (error?.code === "23505") return fail(`"${name}" já existe.`);
  if (error || !row) return fail("Não foi possível salvar. Tente de novo.");

  // Saved here first: a repeated name above must not leave a stray record on the channel.
  const channel = await channelSync(me.organizationId);
  if (channel) {
    const externalId =
      kind === "endings"
        ? await channel.sync.createEnding(channel.instanceId, name)
        : kind === "departments"
          ? await channel.sync.createDepartment(channel.instanceId, name)
          : await channel.sync.createLabel(channel.instanceId, name, color!);
    if (externalId) await supabase.from(TABLE[kind]).update({ external_id: externalId }).eq("id", row.id);
    refresh();
    if (!externalId) return { status: "saved", savedAt: Date.now(), message: `"${name}" foi salvo no Fidera, mas o ChatPro não confirmou.` };
    return { status: "saved", savedAt: Date.now() };
  }
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function saveDistributionAction(_prev: TeamItemState, formData: FormData): Promise<TeamItemState> {
  const me = await requireMembership();
  if (!canManage(me.role)) return fail("Apenas donos e administradores podem alterar isto.");
  const enabled = formData.get("enabled") === "on";
  const accepting = new Set(formData.getAll("members").map(String));
  const get = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  };

  const supabase = await createClient();
  // Server client after the check above: admins may not edit an owner's row under RLS,
  // but choosing who receives conversations, and when, is part of their job.
  const admin = createAdminClient();
  const { data: members, error: membersError } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", me.organizationId);
  if (membersError) return fail("Não foi possível salvar. Tente de novo.");

  // Everything is validated first, so a mistake in one schedule saves nothing.
  const schedules = new Map<string, BusinessHours | null>();
  for (const member of members) {
    const prefix = `member_${member.user_id}_`;
    if (get(`${prefix}has_hours`) !== "on") {
      schedules.set(member.user_id, null);
      continue;
    }
    const parsed = parseBusinessHours(get, prefix);
    if (!parsed.ok) return fail(parsed.message);
    if (Object.keys(parsed.hours).length === 0) return fail("Quem tem horário definido precisa de ao menos um dia marcado.");
    schedules.set(member.user_id, parsed.hours);
  }

  const { error } = await supabase.from("distribution_settings").upsert({ organization_id: me.organizationId, enabled });
  if (error) return fail("Não foi possível salvar. Tente de novo.");
  for (const member of members) {
    const { error: memberError } = await admin
      .from("memberships")
      .update({
        accepts_conversations: accepting.has(member.user_id),
        work_hours: (schedules.get(member.user_id) ?? null) as unknown as Json,
      })
      .eq("organization_id", me.organizationId)
      .eq("user_id", member.user_id);
    if (memberError) return fail("Não foi possível salvar. Tente de novo.");
  }
  await admin.from("audit_log").insert({
    organization_id: me.organizationId,
    actor_id: me.user.id,
    action: "distribution.updated",
    metadata: { enabled },
  });
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function saveAccessAction(_prev: TeamItemState, formData: FormData): Promise<TeamItemState> {
  const me = await requireMembership();
  if (!canManage(me.role)) return fail("Apenas donos e administradores podem alterar isto.");
  const visibility = MEMBER_VISIBILITIES.find((v) => v === formData.get("visibility"));
  if (!visibility) return fail("Escolha uma opção.");

  const supabase = await createClient();
  const { error } = await supabase.from("access_settings").upsert({ organization_id: me.organizationId, member_visibility: visibility });
  if (error) return fail("Não foi possível salvar. Tente de novo.");

  // Only people and departments of this business can be linked: the lists come from here, not the form.
  const [memberships, departments] = await Promise.all([
    supabase.from("memberships").select("user_id").eq("organization_id", me.organizationId).eq("role", "member"),
    supabase.from("departments").select("id").eq("organization_id", me.organizationId),
  ]);
  if (memberships.error || departments.error) return fail("Não foi possível salvar. Tente de novo.");
  const validDepartments = new Set(departments.data.map((d) => d.id));
  const links = memberships.data.flatMap((m) =>
    formData
      .getAll(`departments_${m.user_id}`)
      .map(String)
      .filter((id) => validDepartments.has(id))
      .map((department_id) => ({ organization_id: me.organizationId, user_id: m.user_id, department_id })),
  );

  const { error: deleteError } = await supabase.from("member_departments").delete().eq("organization_id", me.organizationId);
  if (deleteError) return fail("Não foi possível salvar. Tente de novo.");
  if (links.length > 0) {
    const { error: insertError } = await supabase.from("member_departments").insert(links);
    if (insertError) return fail("Não foi possível salvar. Tente de novo.");
  }
  await createAdminClient().from("audit_log").insert({
    organization_id: me.organizationId,
    actor_id: me.user.id,
    action: "access.updated",
    metadata: { member_visibility: visibility },
  });
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function deleteTeamItemAction(formData: FormData): Promise<void> {
  const me = await requireMembership();
  const kind = formData.get("kind");
  if (!canManage(me.role) || !isTeamItemKind(kind)) return;
  const supabase = await createClient();
  await supabase
    .from(TABLE[kind])
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("organization_id", me.organizationId);
  refresh();
}

/** Brings what already exists on the channel. Labels cannot be listed there. */
export async function importTeamItemsAction(_prev: TeamItemState, formData: FormData): Promise<TeamItemState> {
  const me = await requireMembership();
  if (!canManage(me.role)) return fail("Apenas donos e administradores podem alterar isto.");
  const kind = formData.get("kind");
  if (kind !== "endings" && kind !== "departments") return fail("Tipo inválido.");
  const channel = await channelSync(me.organizationId);
  if (!channel) return fail("Conecte o WhatsApp para trazer estes dados.");

  const remote = kind === "endings" ? await channel.sync.listEndings(channel.instanceId) : await channel.sync.listDepartments(channel.instanceId);
  if (!remote) return fail("O ChatPro não respondeu. Tente de novo em alguns minutos.");

  const supabase = await createClient();
  const table = TABLE[kind as TeamItemKind];
  const { data: local, error } = await supabase.from(table).select("id, name, external_id").eq("organization_id", me.organizationId);
  if (error) return fail("Não foi possível ler os dados. Tente de novo.");

  const plan = planImport(local, remote);
  if (plan.add.length > 0) {
    const { error: addError } = await supabase
      .from(table)
      .insert(plan.add.map((a) => ({ organization_id: me.organizationId, name: a.name, external_id: a.externalId })));
    if (addError) return fail("Não foi possível salvar. Tente de novo.");
  }
  for (const link of plan.link) await supabase.from(table).update({ external_id: link.externalId }).eq("id", link.id);
  refresh();

  const total = plan.add.length;
  return {
    status: "saved",
    savedAt: Date.now(),
    message: total === 0 ? "Nada novo no ChatPro." : total === 1 ? "1 item trazido do ChatPro." : `${total} itens trazidos do ChatPro.`,
  };
}
