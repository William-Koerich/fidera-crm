import "server-only";
import type { Tables } from "@/lib/supabase/database.types";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET, MEDIA_UNAVAILABLE } from "@/lib/webhooks/media";
import { afterCursorFilter, encodeCursor, type Cursor } from "./cursor";

export const CONVERSATIONS_PAGE_SIZE = 30;
export const MESSAGES_PAGE_SIZE = 50;

export type InboxFilter = "all" | "awaiting";

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
}): Promise<{ items: ConversationListItem[]; nextCursor: string | null }> {
  const supabase = await createClient();
  let query = supabase
    .from("conversations")
    .select(
      "id, channel, last_message_at, last_message_preview, awaiting_reply, unread_count, reply_window_ends_at, last_inbound_at, last_outbound_at, contacts(id, display_name, phone_normalized, avatar_path, profile_synced_at), channel_accounts(provider)",
    )
    .eq("organization_id", opts.organizationId)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CONVERSATIONS_PAGE_SIZE + 1);

  if (opts.filter === "awaiting") query = query.eq("awaiting_reply", true);
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
      lastMessagePreview: c.last_message_preview,
      awaitingReply: c.awaiting_reply,
      unreadCount: c.unread_count,
      replyWindowEndsAt: c.channel_accounts?.provider === "chatpro" ? null : c.reply_window_ends_at,
      lastFromUs: !!c.last_outbound_at && (!c.last_inbound_at || c.last_outbound_at >= c.last_inbound_at),
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
  replyWindowEndsAt: string | null;
  /** False when replies are not limited to 24h (ChatPro). */
  hasReplyWindow: boolean;
  contact: {
    id: string;
    name: string | null;
    phone: string | null;
    source: Tables<"contacts">["source"];
    createdAt: string;
    lastInteractionAt: string | null;
    avatarUrl: string | null;
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
      "id, organization_id, channel, last_inbound_at, reply_window_ends_at, contact_id, contacts(id, display_name, phone_normalized, source, created_at, last_interaction_at, avatar_path, profile_synced_at), channel_accounts(id, external_account_id, provider, status)",
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
    replyWindowEndsAt: data.channel_accounts.provider === "chatpro" ? null : data.reply_window_ends_at,
    hasReplyWindow: data.channel_accounts.provider !== "chatpro",
    contact: {
      id: data.contacts.id,
      name: data.contacts.display_name,
      phone: data.contacts.phone_normalized,
      source: data.contacts.source,
      createdAt: data.contacts.created_at,
      lastInteractionAt: data.contacts.last_interaction_at,
      avatarUrl: contactAvatarUrl(data.contacts),
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
    .select("id, direction, origin, type, body, status, occurred_at, media_path, media_mime_type, error_code")
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
  const paths = page.map((m) => m.media_path).filter((p): p is string => !!p && p !== MEDIA_UNAVAILABLE);
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
    .select("id, channel, provider, display_name, display_phone, status, disconnected_reason, history_sync_progress")
    .eq("organization_id", organizationId)
    .order("created_at");
  return data ?? [];
}
