"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { getChatProConfig, getChatProPanel, getChatProProvider, getChatProWebhookUrl } from "@/lib/channels/chatpro/config";
import { refreshStaleProfiles, syncContactProfile } from "@/lib/contacts/profile-sync";
import { contactFromJid, parseChatProHistory } from "@/lib/channels/chatpro/parse";
import { ChatProRateLimitError, type ChatProSession } from "@/lib/channels/chatpro/provider";
import { getWhatsAppProviderName } from "@/lib/env";
import { formatPhone } from "@/lib/inbox/format";
import { logEvent } from "@/lib/log";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchPendingMedia } from "@/lib/webhooks/media";

/**
 * Channel accounts are written only by the server (they route webhooks and
 * reference Vault secrets), after checking that the user is owner/admin.
 */
async function requireManager() {
  const me = await requireMembership();
  if (!canManage(me.role)) throw new Error("Only owners and admins manage channels");
  return me;
}

/**
 * Creates or updates a channel account. Refuses an account already owned by
 * another business: a takeover would divert that business's messages.
 */
async function saveChannelAccount(
  organizationId: string,
  provider: "meta" | "chatpro",
  externalAccountId: string,
  values: Partial<TablesInsert<"channel_accounts">>,
): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("channel_accounts")
    .select("id, organization_id")
    .eq("provider", provider)
    .eq("channel", "whatsapp")
    .eq("external_account_id", externalAccountId)
    .maybeSingle();
  if (existing && existing.organization_id !== organizationId) {
    throw new Error("This number is connected to another business");
  }
  const { error } = existing
    ? await admin.from("channel_accounts").update(values).eq("id", existing.id)
    : await admin.from("channel_accounts").insert({
        ...values,
        organization_id: organizationId,
        channel: "whatsapp",
        provider,
        external_account_id: externalAccountId,
      });
  if (error) throw new Error(`Could not save channel account (${error.code})`);
}

/** Creates this business's website chat. Its key is public, so it is random and long. */
export async function createWebchatAction(): Promise<void> {
  const me = await requireManager();
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("channel_accounts")
    .select("id")
    .eq("organization_id", me.organizationId)
    .eq("provider", "webchat")
    .limit(1);
  if (existing?.length) return refresh();
  const { error } = await admin.from("channel_accounts").insert({
    organization_id: me.organizationId,
    channel: "webchat",
    provider: "webchat",
    external_account_id: randomBytes(16).toString("hex"),
    display_name: "Chat do site",
    status: "active",
    connected_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not create the website chat (${error.code})`);
  refresh();
}

/** Mock mode only: creates a fake WhatsApp number so the inbox works without Meta. */
export async function connectMockChannelAction(): Promise<void> {
  const me = await requireManager();
  if (getWhatsAppProviderName() !== "mock") return;
  await createAdminClient()
    .from("channel_accounts")
    .upsert(
      {
        organization_id: me.organizationId,
        channel: "whatsapp",
        provider: "mock",
        external_account_id: `mock-${me.organizationId}`,
        external_business_id: `mock-waba-${me.organizationId}`,
        display_name: "WhatsApp de teste",
        display_phone: "+55 48 3333-4444",
        status: "active",
        disconnected_reason: null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "provider,channel,external_account_id" },
    );
  refresh();
}

/**
 * WHATSAPP_PROVIDER=meta: links the number configured in env (real or the Meta
 * test number) to this business. The access token stays in META_WHATSAPP_TOKEN
 * on the server (or in Vault later), never in the browser.
 */
export async function connectMetaNumberAction(): Promise<void> {
  const me = await requireManager();
  if (getWhatsAppProviderName() !== "meta") return;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  if (!phoneNumberId) throw new Error("Missing META_PHONE_NUMBER_ID.");
  await saveChannelAccount(me.organizationId, "meta", phoneNumberId, {
    external_business_id: process.env.META_WABA_ID ?? null,
    display_name: "WhatsApp do negócio",
    display_phone: process.env.META_DISPLAY_PHONE ?? null,
    status: "active",
    disconnected_reason: null,
    connected_at: new Date().toISOString(),
  });
  refresh();
}

export interface ChatProState {
  status: "idle" | "waiting" | "connected" | "disconnected" | "error";
  qr?: string;
  phone?: string | null;
  message?: string;
}

/** The instance belongs to the single business named in CHATPRO_ORGANIZATION_ID. */
async function requireChatPro() {
  const me = await requireManager();
  const config = getChatProConfig();
  if (
    getWhatsAppProviderName() !== "chatpro" ||
    !config.instanceId ||
    !config.token ||
    config.organizationId !== me.organizationId
  ) {
    throw new Error("ChatPro is not available for this business");
  }
  return { me, instanceId: config.instanceId, provider: getChatProProvider() };
}

const phoneFromWid = (wid: string | null) => {
  if (typeof wid !== "string") return null;
  const contact = contactFromJid(wid.includes("@") ? wid : `${wid}@s.whatsapp.net`, null);
  return contact?.phoneNormalized ? formatPhone(contact.phoneNormalized) : null;
};

function chatProActive(phone: string | null) {
  return {
    display_name: "WhatsApp do negócio",
    display_phone: phone,
    status: "active",
    disconnected_reason: null,
    connected_at: new Date().toISOString(),
  } as const;
}

export interface ChatProWebhookState {
  status: "configured" | "no_public_address" | "no_panel_access" | "failed";
}

/** Points the instance's webhook at this app, so nobody needs to open the ChatPro panel. */
export async function configureChatProWebhookAction(): Promise<ChatProWebhookState> {
  const { instanceId } = await requireChatPro();
  const panel = getChatProPanel();
  if (!panel) return { status: "no_panel_access" };
  const { url, isPublic } = getChatProWebhookUrl();
  if (!isPublic) return { status: "no_public_address" };
  try {
    await panel.setWebhook(instanceId, url);
    return { status: "configured" };
  } catch (e) {
    logEvent("chatpro.webhook_failed", { error: e instanceof Error ? e.message : "unknown" }, "error");
    return { status: "failed" };
  }
}

/** Links the instance to the business and returns a QR Code, unless it is already connected. */
export async function connectChatProAction(): Promise<ChatProState> {
  try {
    const { me, instanceId, provider } = await requireChatPro();
    const status = await provider.getStatus(instanceId);
    if (status.connected) {
      const phone = phoneFromWid(status.wid);
      await saveChannelAccount(me.organizationId, "chatpro", instanceId, chatProActive(phone));
      refresh();
      return { status: "connected", phone };
    }
    await saveChannelAccount(me.organizationId, "chatpro", instanceId, {
      display_name: "WhatsApp do negócio",
      status: "pending",
    });
    return { status: "waiting", qr: await provider.getQrCode(instanceId) };
  } catch (e) {
    logEvent("chatpro.connect_failed", { error: e instanceof Error ? e.message : "unknown" }, "error");
    return { status: "error", message: "Não foi possível falar com o ChatPro. Confira a instância e o token." };
  }
}

/** Current connection state. ChatPro does not notify connection changes, so the screen polls this. */
export async function checkChatProAction(): Promise<ChatProState> {
  try {
    const { me, instanceId, provider } = await requireChatPro();
    const admin = createAdminClient();
    const { data: account } = await admin
      .from("channel_accounts")
      .select("id, status")
      .eq("organization_id", me.organizationId)
      .eq("provider", "chatpro")
      .eq("external_account_id", instanceId)
      .maybeSingle();
    const status = await provider.getStatus(instanceId);
    const phone = phoneFromWid(status.wid);

    if (!account) return { status: "idle" };
    if (status.connected) {
      if (account.status !== "active") {
        await saveChannelAccount(me.organizationId, "chatpro", instanceId, chatProActive(phone));
        refresh();
      }
      return { status: "connected", phone };
    }
    if (account.status === "active") {
      await admin
        .from("channel_accounts")
        .update({ status: "disconnected", disconnected_reason: "CHATPRO_SESSION_CLOSED" })
        .eq("id", account.id);
      refresh();
    }
    return { status: account.status === "pending" ? "waiting" : "disconnected" };
  } catch (e) {
    logEvent("chatpro.check_failed", { error: e instanceof Error ? e.message : "unknown" }, "warn");
    return { status: "error", message: "Não foi possível consultar o ChatPro agora." };
  }
}

export type ChatProSessionList =
  | { status: "ok"; sessions: ChatProSession[] }
  | { status: "rate_limited" | "error"; sessions: [] };

/** First step of the import: which conversations ChatPro holds. */
export async function listChatProSessionsAction(): Promise<ChatProSessionList> {
  try {
    const { instanceId, provider } = await requireChatPro();
    return { status: "ok", sessions: await provider.listSessions(instanceId) };
  } catch (e) {
    if (e instanceof ChatProRateLimitError) return { status: "rate_limited", sessions: [] };
    logEvent("chatpro.import_failed", { error: e instanceof Error ? e.message : "unknown" }, "error");
    return { status: "error", sessions: [] };
  }
}

export interface ChatProSessionImport {
  status: "ok" | "rate_limited" | "error";
  inserted: number;
}

/**
 * Imports one conversation. The screen drives one call at a time, so ChatPro's
 * rate limit and the server's time limit never cut a long import. Running it
 * again is safe: messages are unique per account and external id.
 */
export async function importChatProSessionAction(session: ChatProSession): Promise<ChatProSessionImport> {
  try {
    const { instanceId, provider } = await requireChatPro();
    const messages = await provider.getSessionMessages(instanceId, String(session.id));
    const name = session.leadId ? await provider.getLeadName(instanceId, String(session.leadId)) : null;
    const events = parseChatProHistory(messages, instanceId, name);
    if (events.length === 0) return { status: "ok", inserted: 0 };

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("ingest_events", {
      p_provider: "chatpro",
      p_events: JSON.parse(JSON.stringify(events)) as Json,
    });
    if (error) throw new Error(`ingest_events: ${error.message}`);
    const inserted = (data as unknown as { inserted: number }).inserted;
    await refreshStaleProfiles(admin, "chatpro", events).catch((e: unknown) => {
      logEvent("contact.profile_failed", { error: e instanceof Error ? e.message : "unknown" }, "warn");
    });
    if (inserted > 0) {
      await fetchPendingMedia(admin, 5).catch(() => 0);
      refresh();
    }
    return { status: "ok", inserted };
  } catch (e) {
    if (e instanceof ChatProRateLimitError) return { status: "rate_limited", inserted: 0 };
    logEvent("chatpro.import_failed", { error: e instanceof Error ? e.message : "unknown" }, "error");
    return { status: "error", inserted: 0 };
  }
}

/** Contacts of this business reachable on WhatsApp, for the screen to update one at a time. */
export async function listContactsForProfileSyncAction(): Promise<string[]> {
  const { me } = await requireChatPro();
  const { data, error } = await createAdminClient()
    .from("contact_identities")
    .select("contact_id")
    .eq("organization_id", me.organizationId)
    .eq("channel", "whatsapp");
  if (error) throw new Error(`Could not list contacts (${error.code})`);
  return [...new Set(data.map((i) => i.contact_id))];
}

export async function syncContactProfileAction(contactId: string): Promise<"ok" | "rate_limited" | "error"> {
  try {
    const { me, instanceId } = await requireChatPro();
    const admin = createAdminClient();
    const { data: identity } = await admin
      .from("contact_identities")
      .select("external_id")
      .eq("organization_id", me.organizationId)
      .eq("channel", "whatsapp")
      .eq("contact_id", String(contactId))
      .limit(1)
      .maybeSingle();
    if (!identity) return "error";
    await syncContactProfile(admin, "chatpro", {
      accountExternalId: instanceId,
      organizationId: me.organizationId,
      contactId: String(contactId),
      externalId: identity.external_id,
    });
    refresh();
    return "ok";
  } catch (e) {
    if (e instanceof ChatProRateLimitError) return "rate_limited";
    logEvent("contact.profile_failed", { error: e instanceof Error ? e.message : "unknown" }, "warn");
    return "error";
  }
}

export async function disconnectChatProAction(): Promise<ChatProState> {
  try {
    const { me, instanceId, provider } = await requireChatPro();
    await provider.disconnect(instanceId);
    const admin = createAdminClient();
    await admin
      .from("channel_accounts")
      .update({ status: "disconnected", disconnected_reason: "CHATPRO_DISCONNECTED_BY_USER" })
      .eq("organization_id", me.organizationId)
      .eq("provider", "chatpro")
      .eq("external_account_id", instanceId);
    await admin.from("audit_log").insert({
      organization_id: me.organizationId,
      actor_id: me.user.id,
      action: "channel_account.disconnected",
      metadata: { provider: "chatpro" },
    });
    refresh();
    return { status: "disconnected" };
  } catch (e) {
    logEvent("chatpro.disconnect_failed", { error: e instanceof Error ? e.message : "unknown" }, "error");
    return { status: "error", message: "Não foi possível desconectar agora. Tente de novo." };
  }
}

/**
 * Removes a number from this business. Its conversations and messages go with
 * it (foreign keys cascade) and its token leaves Vault. A connected ChatPro
 * session is closed first so the phone does not stay linked.
 */
export async function removeChannelAccountAction(formData: FormData): Promise<void> {
  const me = await requireManager();
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("channel_accounts")
    .select("id, provider, external_account_id")
    .eq("id", String(formData.get("accountId") ?? ""))
    .eq("organization_id", me.organizationId)
    .maybeSingle();
  if (!account) return;

  if (account.provider === "chatpro") {
    await getChatProProvider()
      .disconnect(account.external_account_id)
      .catch((e: unknown) => {
        logEvent("chatpro.disconnect_failed", { error: e instanceof Error ? e.message : "unknown" }, "warn");
      });
  }

  const { error } = await admin.from("channel_accounts").delete().eq("id", account.id);
  if (error) throw new Error(`Could not remove channel account (${error.code})`);
  await admin.from("audit_log").insert({
    organization_id: me.organizationId,
    actor_id: me.user.id,
    action: "channel_account.removed",
    target_table: "channel_accounts",
    target_id: account.id,
    metadata: { provider: account.provider },
  });
  refresh();
}
