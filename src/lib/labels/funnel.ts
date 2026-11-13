import "server-only";
import { previewText } from "@/lib/inbox/format";
import { createClient } from "@/lib/supabase/server";
import { isStage, type LabelInfo } from "./stages";

export interface FunnelCard {
  contactId: string;
  name: string | null;
  phone: string | null;
  avatarUrl: string | null;
  /** Latest conversation, to open it from the card. */
  conversationId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  awaitingReply: boolean;
  /** Plain labels (not stages) of the contact. */
  labelIds: string[];
  /** When the contact entered its stage. */
  since: string | null;
}

export interface Funnel {
  stages: LabelInfo[];
  /** Cards per stage id; "none" holds recent open conversations without a stage. */
  columns: Record<string, FunnelCard[]>;
}

/** Most contacts one column shows. */
export const FUNNEL_COLUMN_LIMIT = 200;
const UNSTAGED_LIMIT = 60;

function avatarUrl(contact: { id: string; avatar_path: string | null; profile_synced_at: string | null }) {
  return contact.avatar_path ? `/api/contacts/${contact.id}/avatar?v=${encodeURIComponent(contact.profile_synced_at ?? "")}` : null;
}

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

/**
 * Contacts by funnel stage, newest in the stage first, plus the recent open conversations that
 * have no stage yet. With `onlyLabelId`, only contacts that also have that label. RLS applies.
 */
export async function loadFunnel(
  organizationId: string,
  labels: LabelInfo[],
  onlyLabelId: string | null,
): Promise<{ funnel: Funnel; totals: Record<string, number> }> {
  const supabase = await createClient();
  const stages = labels.filter(isStage);
  const stageIds = new Set(stages.map((s) => s.id));
  const plainIds = new Set(labels.filter((l) => !isStage(l)).map((l) => l.id));

  // One query per stage, so a crowded stage never hides the others.
  const perStage = await Promise.all(
    stages.map((stage) =>
      supabase
        .from("contact_labels")
        .select("contact_id, label_id, created_at, contacts(id, display_name, phone_normalized, avatar_path, profile_synced_at, labels:contact_labels(label_id))", {
          count: "exact",
        })
        .eq("organization_id", organizationId)
        .eq("label_id", stage.id)
        .order("created_at", { ascending: false })
        .limit(FUNNEL_COLUMN_LIMIT),
    ),
  );
  if (perStage.some((r) => r.error)) throw new Error("Could not load the funnel");

  const keep = (labelIds: string[]) => !onlyLabelId || labelIds.includes(onlyLabelId);
  const columns: Record<string, FunnelCard[]> = { none: [] };
  const totals: Record<string, number> = {};
  const seen = new Set<string>();
  stages.forEach((stage, i) => {
    const result = perStage[i]!;
    const column: FunnelCard[] = [];
    columns[stage.id] = column;
    for (const row of result.data ?? []) {
      const contact = row.contacts;
      if (!contact || seen.has(contact.id)) continue;
      const labelIds = contact.labels.map((l) => l.label_id);
      if (!keep(labelIds)) continue;
      seen.add(contact.id);
      column.push({
        contactId: contact.id,
        name: contact.display_name,
        phone: contact.phone_normalized,
        avatarUrl: avatarUrl(contact),
        conversationId: null,
        lastMessageAt: null,
        lastMessagePreview: null,
        awaitingReply: false,
        labelIds: labelIds.filter((id) => plainIds.has(id)),
        since: row.created_at,
      });
    }
    // Without a filter the database count is exact; with one, it is what was loaded.
    totals[stage.id] = onlyLabelId ? column.length : (result.count ?? column.length);
  });

  // The latest conversation of each staged contact, to open it and show the last message.
  const cards = Object.values(columns).flat();
  for (const ids of chunks(cards.map((c) => c.contactId), 100)) {
    const { data: conversations } = await supabase
      .from("conversations")
      .select("id, contact_id, last_message_at, last_message_preview, awaiting_reply")
      .eq("organization_id", organizationId)
      .in("contact_id", ids)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    for (const conversation of conversations ?? []) {
      for (const card of cards) {
        if (card.contactId !== conversation.contact_id || card.conversationId) continue;
        card.conversationId = conversation.id;
        card.lastMessageAt = conversation.last_message_at;
        card.lastMessagePreview = previewText(conversation.last_message_preview);
        card.awaitingReply = conversation.awaiting_reply;
      }
    }
  }

  // New people: open conversations whose contact has no stage yet.
  const { data: open } = await supabase
    .from("conversations")
    .select("id, last_message_at, last_message_preview, awaiting_reply, contacts(id, display_name, phone_normalized, avatar_path, profile_synced_at, labels:contact_labels(label_id))")
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(UNSTAGED_LIMIT * 3);
  for (const conversation of open ?? []) {
    const contact = conversation.contacts;
    if (!contact || seen.has(contact.id)) continue;
    const labelIds = contact.labels.map((l) => l.label_id);
    if (labelIds.some((id) => stageIds.has(id)) || !keep(labelIds)) continue;
    seen.add(contact.id);
    if (columns.none!.length >= UNSTAGED_LIMIT) continue;
    columns.none!.push({
      contactId: contact.id,
      name: contact.display_name,
      phone: contact.phone_normalized,
      avatarUrl: avatarUrl(contact),
      conversationId: conversation.id,
      lastMessageAt: conversation.last_message_at,
      lastMessagePreview: previewText(conversation.last_message_preview),
      awaitingReply: conversation.awaiting_reply,
      labelIds: labelIds.filter((id) => plainIds.has(id)),
      since: null,
    });
  }
  totals.none = columns.none!.length;
  return { funnel: { stages, columns }, totals };
}
