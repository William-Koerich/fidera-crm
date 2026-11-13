import "server-only";
import { getProviderByName } from "@/lib/channels";
import { logEvent } from "@/lib/log";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { planLabelChange, sortLabels, type LabelInfo } from "./stages";

export interface LabelRecord extends LabelInfo {
  externalId: string | null;
}

/** The business's labels, stages first in funnel order. RLS applies. */
export async function listLabels(organizationId: string): Promise<LabelRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("labels")
    .select("id, name, color, external_id, stage_position")
    .eq("organization_id", organizationId);
  if (error) throw new Error("Could not load the labels");
  return sortLabels(data.map((l) => ({ id: l.id, name: l.name, color: l.color, externalId: l.external_id, stagePosition: l.stage_position })));
}

/** Labels of many contacts at once, for lists. RLS applies. */
export async function labelsByContact(contactIds: string[]): Promise<Map<string, string[]>> {
  const byContact = new Map<string, string[]>();
  if (contactIds.length === 0) return byContact;
  const supabase = await createClient();
  const { data, error } = await supabase.from("contact_labels").select("contact_id, label_id").in("contact_id", contactIds);
  if (error) throw new Error("Could not load the contacts' labels");
  for (const row of data) byContact.set(row.contact_id, [...(byContact.get(row.contact_id) ?? []), row.label_id]);
  return byContact;
}

/** Where to mirror a contact's labels: the channel of its latest conversation, when it syncs. */
async function channelOf(organizationId: string, contactId: string) {
  const admin = createAdminClient();
  const { data: conversation } = await admin
    .from("conversations")
    .select("channel, channel_accounts(provider, external_account_id, status)")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const account = conversation?.channel_accounts;
  if (!conversation || !account || account.status !== "active") return null;
  const sync = getProviderByName(account.provider).team;
  if (!sync) return null;
  const { data: identity } = await admin
    .from("contact_identities")
    .select("external_id")
    .eq("contact_id", contactId)
    .eq("channel", conversation.channel)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!identity) return null;
  return { sync, instanceId: account.external_account_id, to: identity.external_id };
}

export interface LabelChangeResult {
  status: "saved" | "error";
  notice?: string;
  /** The contact's labels after the change. */
  labelIds?: string[];
}

/**
 * Turns one label on or off for a contact. A stage takes the contact out of its other stage.
 * The CRM is the record; the channel follows when it can.
 */
export async function changeContactLabel(input: {
  organizationId: string;
  contactId: string;
  labelId: string;
  on: boolean;
}): Promise<LabelChangeResult> {
  const supabase = await createClient();
  const [labels, { data: current, error: readError }] = await Promise.all([
    listLabels(input.organizationId),
    supabase.from("contact_labels").select("label_id").eq("contact_id", input.contactId),
  ]);
  if (readError) return { status: "error", notice: "Não foi possível salvar. Tente de novo." };
  if (!labels.some((l) => l.id === input.labelId)) return { status: "error", notice: "Etiqueta não encontrada." };
  const currentIds = current.map((r) => r.label_id);
  const plan = planLabelChange(labels, currentIds, input.labelId, input.on);

  if (plan.remove.length) {
    const { error } = await supabase.from("contact_labels").delete().eq("contact_id", input.contactId).in("label_id", plan.remove);
    if (error) return { status: "error", notice: "Não foi possível salvar. Tente de novo." };
  }
  if (plan.add.length) {
    const { error } = await supabase
      .from("contact_labels")
      .upsert(plan.add.map((label_id) => ({ organization_id: input.organizationId, contact_id: input.contactId, label_id })));
    if (error) return { status: "error", notice: "Não foi possível salvar. Tente de novo." };
  }
  const labelIds = [...currentIds.filter((id) => !plan.remove.includes(id)), ...plan.add];

  const changes = [...plan.add.map((id) => ({ id, on: true })), ...plan.remove.map((id) => ({ id, on: false }))];
  if (changes.length === 0) return { status: "saved", labelIds };
  const channel = await channelOf(input.organizationId, input.contactId).catch(() => null);
  if (!channel) return { status: "saved", labelIds };
  let mirrored = true;
  for (const change of changes) {
    const externalId = labels.find((l) => l.id === change.id)?.externalId;
    if (!externalId) continue;
    const ok = await channel.sync
      .setContactLabel({ accountExternalId: channel.instanceId, to: channel.to, labelExternalId: externalId, on: change.on })
      .catch(() => false);
    mirrored &&= ok;
  }
  if (mirrored) return { status: "saved", labelIds };
  logEvent("labels.not_mirrored", { contactId: input.contactId }, "warn");
  return { status: "saved", labelIds, notice: "Salvo no Fidera, mas o ChatPro não confirmou." };
}

/**
 * A new label, mirrored to the channel. Managers only (RLS). A name already in use returns the
 * existing label instead of failing.
 */
export async function createLabel(
  organizationId: string,
  input: { name: string; color: string; stagePosition?: number | null },
): Promise<{ id: string; existed: boolean } | { error: string }> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("labels")
    .insert({ organization_id: organizationId, name: input.name, color: input.color, stage_position: input.stagePosition ?? null })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const { data: same } = await supabase.from("labels").select("id").eq("organization_id", organizationId).eq("name", input.name).maybeSingle();
    return same ? { id: same.id, existed: true } : { error: "Já existe uma etiqueta com esse nome." };
  }
  if (error || !row) return { error: "Não foi possível criar a etiqueta." };

  const { data: accounts } = await createAdminClient()
    .from("channel_accounts")
    .select("provider, external_account_id")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  for (const account of accounts ?? []) {
    const sync = getProviderByName(account.provider).team;
    if (!sync) continue;
    const externalId = await sync.createLabel(account.external_account_id, input.name, input.color).catch(() => null);
    if (externalId) await supabase.from("labels").update({ external_id: externalId }).eq("id", row.id);
    break;
  }
  return { id: row.id, existed: false };
}
