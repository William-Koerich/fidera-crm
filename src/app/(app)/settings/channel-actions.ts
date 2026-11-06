"use server";

import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { getChatProConfig, getChatProProvider } from "@/lib/channels/chatpro/config";
import { contactFromJid } from "@/lib/channels/chatpro/parse";
import { getWhatsAppProviderName } from "@/lib/env";
import { formatPhone } from "@/lib/inbox/format";
import { logEvent } from "@/lib/log";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/server";

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
