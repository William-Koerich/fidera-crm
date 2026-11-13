import type { BusinessHours } from "@/lib/replies/auto-reply";
import { getProviderByName } from "@/lib/channels";
import { isStoragePathOf } from "./attachments";
import { previewText } from "./format";
import "server-only";
import type { Tables } from "@/lib/supabase/database.types";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET, MEDIA_UNAVAILABLE } from "@/lib/webhooks/media";
import { afterCursorFilter, encodeCursor, type Cursor } from "./cursor";

export const CONVERSATIONS_PAGE_SIZE = 30;
export const MESSAGES_PAGE_SIZE = 50;

export type InboxFilter = "all" | "awaiting" | "mine" | "closed";

export interface ConversationListItem {
  id: string;
  channel: Tables<"conversations">["channel"];
  contactName: string | null;
  contactPhone: string | null;
  contactAvatarUrl: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  awaitingReply: boolean;
  unreadCount: number;
  replyWindowEndsAt: string | null;
  /** The latest message was sent by the business (API or phone). */
  lastFromUs: boolean;
  /** The contact's labels and stage. */
  labelIds: string[];
}

/** Only Meta's official API limits free replies to 24 hours after the customer's last message. */
function hasReplyWindow(provider: string | undefined): boolean {
  return provider === "meta" || provider === "mock";
}

/** The version in the query string makes the browser fetch a photo again after each sync. */
function contactAvatarUrl(contact: { id: string; avatar_path: string | null; profile_synced_at: string | null }): string | null {
  if (!contact.avatar_path) return null;
  return `/api/contacts/${contact.id}/avatar?v=${encodeURIComponent(contact.profile_synced_at ?? "")}`;
}

/** Conversations of the active organization, newest first, keyset-paginated. RLS applies. */
export async function listConversations(opts: {
  organizationId: string;
  filter: InboxFilter;
  cursor: Cursor | null;
  /** The signed-in person, for the "mine" filter. */
  userId: string;
  /** Search text: looks through open and finished conversations alike. */
  search?: string | null;
  /** Only contacts with this label (or in this stage). */
  labelId?: string | null;
}): Promise<{ items: ConversationListItem[]; nextCursor: string | null }> {
  const supabase = await createClient();
  // With a label chosen, only contacts that have it: `match` is there just to filter.
  let query = supabase
    .from("conversations")
    .select(
      opts.labelId
        ? "id, channel, last_message_at, last_message_preview, awaiting_reply, unread_count, reply_window_ends_at, last_inbound_at, last_outbound_at, contacts!inner(id, display_name, phone_normalized, avatar_path, profile_synced_at, labels:contact_labels(label_id), match:contact_labels!inner(label_id)), channel_accounts(provider)"
        : "id, channel, last_message_at, last_message_preview, awaiting_reply, unread_count, reply_window_ends_at, last_inbound_at, last_outbound_at, contacts(id, display_name, phone_normalized, avatar_path, profile_synced_at, labels:contact_labels(label_id)), channel_accounts(provider)",
    )
    .eq("organization_id", opts.organizationId)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CONVERSATIONS_PAGE_SIZE + 1);

  if (opts.search) {
    const { data: ids, error: searchError } = await supabase.rpc("search_conversations", {
      p_org: opts.organizationId,
      p_query: opts.search,
    });
    if (searchError) throw new Error("Could not search conversations");
    query = query.in("id", (ids ?? []) as unknown as string[]);
  } else {
    query = query.eq("status", opts.filter === "closed" ? "closed" : "open");
  }
  if (opts.filter === "awaiting") query = query.eq("awaiting_reply", true);
  if (opts.filter === "mine") query = query.eq("assigned_to", opts.userId);
  if (opts.labelId) query = query.eq("contacts.match.label_id", opts.labelId);
  if (opts.cursor) query = query.or(afterCursorFilter("last_message_at", opts.cursor));

  const { data, error } = await query;
  if (error) throw new Error("Could not load conversations");

  const page = data.slice(0, CONVERSATIONS_PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: page.map((c) => ({
      id: c.id,
      channel: c.channel,
      contactName: c.contacts?.display_name ?? null,
      contactPhone: c.contacts?.phone_normalized ?? null,
      contactAvatarUrl: c.contacts ? contactAvatarUrl(c.contacts) : null,
      lastMessageAt: c.last_message_at,
      lastMessagePreview: previewText(c.last_message_preview),
      awaitingReply: c.awaiting_reply,
      unreadCount: c.unread_count,
      replyWindowEndsAt: hasReplyWindow(c.channel_accounts?.provider) ? c.reply_window_ends_at : null,
      lastFromUs: !!c.last_outbound_at && (!c.last_inbound_at || c.last_outbound_at >= c.last_inbound_at),
      labelIds: c.contacts?.labels.map((l) => l.label_id) ?? [],
    })),
    nextCursor:
      data.length > CONVERSATIONS_PAGE_SIZE && last?.last_message_at
        ? encodeCursor({ at: last.last_message_at, id: last.id })
        : null,
  };
}

export interface ConversationDetail {
  id: string;
  organizationId: string;
  channel: Tables<"conversations">["channel"];
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  replyWindowEndsAt: string | null;
  /** False when replies are not limited to 24h (ChatPro). */
  hasReplyWindow: boolean;
  /** Team member responsible for this conversation. */
  assignedTo: string | null;
  status: "open" | "closed";
  departmentId: string | null;
  /** Whether this channel's provider sends files. */
  canSendFiles: boolean;
  contact: {
    id: string;
    name: string | null;
    phone: string | null;
    source: Tables<"contacts">["source"];
    createdAt: string;
    lastInteractionAt: string | null;
    avatarUrl: string | null;
    /** Team member this client belongs to (carteira). */
    ownerId: string | null;
  };
  account: { id: string; externalAccountId: string; provider: Tables<"channel_accounts">["provider"]; status: Tables<"channel_accounts">["status"] };
  /** Channel identifier to send to (wa_id / IGSID). */
  recipientExternalId: string | null;
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, organization_id, channel, assigned_to, status, department_id, last_inbound_at, last_outbound_at, reply_window_ends_at, contact_id, contacts(id, display_name, phone_normalized, source, created_at, last_interaction_at, avatar_path, profile_synced_at, owner_id), channel_accounts(id, external_account_id, provider, status)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data || !data.contacts || !data.channel_accounts) return null;

  const { data: identity } = await supabase
    .from("contact_identities")
    .select("external_id")
    .eq("contact_id", data.contact_id)
    .eq("channel", data.channel)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    id: data.id,
    organizationId: data.organization_id,
    channel: data.channel,
    lastInboundAt: data.last_inbound_at,
    lastOutboundAt: data.last_outbound_at,
    replyWindowEndsAt: hasReplyWindow(data.channel_accounts.provider) ? data.reply_window_ends_at : null,
    hasReplyWindow: hasReplyWindow(data.channel_accounts.provider),
    assignedTo: data.assigned_to,
    status: data.status === "closed" ? "closed" : "open",
    departmentId: data.department_id,
    canSendFiles: !!getProviderByName(data.channel_accounts.provider).sendMedia,
    contact: {
      id: data.contacts.id,
      name: data.contacts.display_name,
      phone: data.contacts.phone_normalized,
      source: data.contacts.source,
      createdAt: data.contacts.created_at,
      lastInteractionAt: data.contacts.last_interaction_at,
      avatarUrl: contactAvatarUrl(data.contacts),
      ownerId: data.contacts.owner_id,
    },
    account: {
      id: data.channel_accounts.id,
      externalAccountId: data.channel_accounts.external_account_id,
      provider: data.channel_accounts.provider,
      status: data.channel_accounts.status,
    },
    recipientExternalId: identity?.external_id ?? null,
  };
}

export interface TeamMember {
  id: string;
  email: string;
  /** Set in Ajustes; null until then. Show it with memberName(). */
  name: string | null;
}

export async function listTeamMembers(organizationId: string): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_members", { org_id: organizationId });
  if (error) throw new Error(`Could not load the team (${error.code})`);
  return data.map((m) => ({ id: m.user_id, email: m.email, name: m.display_name ?? null }));
}

export async function getDistribution(organizationId: string): Promise<{
  enabled: boolean;
  members: { id: string; email: string; name: string | null; acceptsConversations: boolean; workHours: BusinessHours | null }[];
}> {
  const supabase = await createClient();
  const [settings, memberships, team] = await Promise.all([
    supabase.from("distribution_settings").select("enabled").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("memberships").select("user_id, accepts_conversations, work_hours").eq("organization_id", organizationId),
    listTeamMembers(organizationId),
  ]);
  if (settings.error || memberships.error) throw new Error("Could not load the distribution settings");
  const byUser = new Map(memberships.data.map((m) => [m.user_id, m]));
  return {
    enabled: settings.data?.enabled ?? false,
    members: team.map((m) => ({
      ...m,
      acceptsConversations: byUser.get(m.id)?.accepts_conversations ?? true,
      workHours: (byUser.get(m.id)?.work_hours ?? null) as unknown as BusinessHours | null,
    })),
  };
}

export const MEMBER_VISIBILITIES = ["all", "department", "own"] as const;
export type MemberVisibility = (typeof MEMBER_VISIBILITIES)[number];

/** For managers: what members see, and the departments of those who are not managers. */
export async function getAccessSettings(organizationId: string): Promise<{
  visibility: MemberVisibility;
  members: { id: string; email: string; name: string | null; departmentIds: string[] }[];
}> {
  const supabase = await createClient();
  const [settings, memberships, departments, team] = await Promise.all([
    supabase.from("access_settings").select("member_visibility").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("memberships").select("user_id, role").eq("organization_id", organizationId),
    supabase.from("member_departments").select("user_id, department_id").eq("organization_id", organizationId),
    listTeamMembers(organizationId),
  ]);
  if (settings.error || memberships.error || departments.error) throw new Error("Could not load the access settings");
  const plainMembers = new Set(memberships.data.filter((m) => m.role === "member").map((m) => m.user_id));
  const visibility = MEMBER_VISIBILITIES.find((v) => v === settings.data?.member_visibility) ?? "all";
  return {
    visibility,
    members: team
      .filter((m) => plainMembers.has(m.id))
      .map((m) => ({ ...m, departmentIds: departments.data.filter((d) => d.user_id === m.id).map((d) => d.department_id) })),
  };
}

export interface InboxOption {
  id: string;
  name: string;
  /** The provider's id for this record, when it exists there. */
  externalId: string | null;
  color?: string;
}

/** What the team can choose from while handling a conversation. RLS applies. */
export async function listInboxOptions(organizationId: string): Promise<{
  endings: InboxOption[];
  departments: InboxOption[];
  labels: InboxOption[];
}> {
  const supabase = await createClient();
  const [endings, departments, labels] = await Promise.all([
    supabase.from("ending_reasons").select("id, name, external_id").eq("organization_id", organizationId).order("name"),
    supabase.from("departments").select("id, name, external_id").eq("organization_id", organizationId).order("name"),
    supabase.from("labels").select("id, name, external_id, color").eq("organization_id", organizationId).order("name"),
  ]);
  if (endings.error || departments.error || labels.error) throw new Error("Could not load the inbox options");
  const option = (r: { id: string; name: string; external_id: string | null }): InboxOption => ({
    id: r.id,
    name: r.name,
    externalId: r.external_id,
  });
  return {
    endings: endings.data.map(option),
    departments: departments.data.map(option),
    labels: labels.data.map((r) => ({ ...option(r), color: r.color })),
  };
}

export async function listContactLabelIds(contactId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("contact_labels").select("label_id").eq("contact_id", contactId);
  if (error) throw new Error("Could not load the contact's labels");
  return data.map((l) => l.label_id);
}

export interface NoteItem {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
}

/** Notes in the same period as the messages on screen, so paging keeps them in place. */
export async function listNotes(conversationId: string, from: string | null, to: string | null): Promise<NoteItem[]> {
  const supabase = await createClient();
  let query = supabase.from("conversation_notes").select("id, body, created_at, author_id").eq("conversation_id", conversationId);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  const { data, error } = await query.order("created_at").limit(200);
  if (error) throw new Error("Could not load the notes");
  return data.map((n) => ({ id: n.id, body: n.body, createdAt: n.created_at, authorId: n.author_id }));
}

export type MessageItem = Pick<
  Tables<"messages">,
  "id" | "direction" | "origin" | "type" | "body" | "status" | "occurred_at" | "media_path" | "media_mime_type" | "error_code"
> & { mediaUrl: string | null };

/** Messages oldest-first for display; `before` pages backwards in time. */
export async function listMessages(
  conversationId: string,
  before: Cursor | null,
): Promise<{ items: MessageItem[]; olderCursor: string | null }> {
  const supabase = await createClient();
  let query = supabase
    .from("messages")
    .select("id, organization_id, direction, origin, type, body, status, occurred_at, media_path, media_mime_type, error_code")
    .eq("conversation_id", conversationId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGES_PAGE_SIZE + 1);
  if (before) query = query.or(afterCursorFilter("occurred_at", before));

  const { data, error } = await query;
  if (error) throw new Error("Could not load messages");
  const page = data.slice(0, MESSAGES_PAGE_SIZE);
  const oldest = page.at(-1);

  // Rows above were read with the user's client (RLS), so signing their media is safe.
  const paths = page
    .filter((m) => m.media_path && isStoragePathOf(m.media_path, m.organization_id))
    .map((m) => m.media_path!)
    .filter((p) => p !== MEDIA_UNAVAILABLE);
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUrls(paths, 300);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  return {
    items: page.reverse().map((m) => ({ ...m, mediaUrl: m.media_path ? (signed.get(m.media_path) ?? null) : null })),
    olderCursor:
      data.length > MESSAGES_PAGE_SIZE && oldest ? encodeCursor({ at: oldest.occurred_at, id: oldest.id }) : null,
  };
}

/** How many conversations each channel account holds (shown before removing one). */
export async function countConversations(accountIds: string[]): Promise<Map<string, number>> {
  const supabase = await createClient();
  const counts = await Promise.all(
    accountIds.map(async (id) => {
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("channel_account_id", id);
      return [id, count ?? 0] as const;
    }),
  );
  return new Map(counts);
}

export async function listChannelAccounts(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("channel_accounts")
    .select("id, channel, provider, external_account_id, display_name, display_phone, status, disconnected_reason, history_sync_progress")
    .eq("organization_id", organizationId)
    .order("created_at");
  return data ?? [];
}
