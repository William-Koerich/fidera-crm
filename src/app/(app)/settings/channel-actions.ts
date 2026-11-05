"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { canManage, requireMembership } from "@/lib/auth";
import { CoexyApiError, type CoexyChannel } from "@/lib/coexy/client";
import { getCoexyClient } from "@/lib/coexy/server";
import { getWhatsAppProviderName } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/server";

export interface ChannelActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

/**
 * Channel accounts are written only by the server (they route webhooks and
 * reference Vault secrets), after checking that the user is owner/admin.
 */
async function requireManager() {
  const me = await requireMembership();
  if (!canManage(me.role)) throw new Error("Only owners and admins manage channels");
  return me;
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

/** Maps a Coexy channel onto our channel account row. */
async function syncCoexyChannel(accountId: string, organizationId: string, channel: CoexyChannel): Promise<void> {
  const admin = createAdminClient();
  const connected = channel.status === "active" && channel.phone_number_id;
  const { error } = await admin
    .from("channel_accounts")
    .update(
      connected
        ? {
            status: "active",
            external_account_id: channel.phone_number_id!,
            external_business_id: channel.waba_id,
            display_phone: channel.display_phone_number,
            connected_at: channel.connected_at ?? new Date().toISOString(),
            disconnected_reason: null,
          }
        : channel.status === "pending"
          ? { status: "pending" }
          : { status: "disconnected", disconnected_reason: `COEXY_${channel.status.toUpperCase()}` },
    )
    .eq("id", accountId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.code === "23505" ? "phone_already_connected" : "sync_failed");
  if (channel.channel_token) {
    await admin.rpc("set_channel_token", { p_account_id: accountId, p_token: channel.channel_token });
  }
}

/**
 * Starts (or resumes) the Coexy connection: creates a Coexy channel for this
 * business, stores its token in Vault and sends the owner to Coexy's
 * connect_url (Meta Embedded Signup with coexistence, run by Coexy).
 */
export async function startCoexyConnectionAction(): Promise<ChannelActionState> {
  const me = await requireManager();
  if (getWhatsAppProviderName() !== "coexy") return { status: "error", message: "Coexy não está habilitado." };

  const admin = createAdminClient();
  const coexy = getCoexyClient();
  let connectUrl: string | null = null;

  try {
    const { data: existing } = await admin
      .from("channel_accounts")
      .select("id, provider_channel_id, status")
      .eq("organization_id", me.organizationId)
      .eq("provider", "coexy")
      .neq("status", "active")
      .maybeSingle();

    if (existing?.provider_channel_id) {
      const channel = await coexy.getChannel(existing.provider_channel_id);
      await syncCoexyChannel(existing.id, me.organizationId, channel);
      connectUrl = channel.status === "active" ? null : channel.connect_url;
    } else {
      const channel = await coexy.createChannel(me.organizationName.slice(0, 80) || "Fidera");
      const { data: account, error } = await admin
        .from("channel_accounts")
        .insert({
          organization_id: me.organizationId,
          channel: "whatsapp",
          provider: "coexy",
          provider_channel_id: channel.id,
          external_account_id: `pending:${channel.id}`,
          display_name: "WhatsApp Business",
          status: "pending",
        })
        .select("id")
        .single();
      if (error) throw new Error("insert_failed");
      if (channel.channel_token) {
        await admin.rpc("set_channel_token", { p_account_id: account.id, p_token: channel.channel_token });
      }
      await admin.from("audit_log").insert({
        organization_id: me.organizationId,
        actor_id: me.user.id,
        action: "channel_account.connect_started",
        target_table: "channel_accounts",
        target_id: account.id,
        metadata: { provider: "coexy" },
      });
      connectUrl = channel.connect_url;
    }
  } catch (e) {
    logEvent("coexy.connect_failed", { code: e instanceof CoexyApiError ? e.code : "unknown" }, "error");
    return { status: "error", message: "Não foi possível iniciar a conexão com o Coexy. Tente de novo." };
  }

  if (!connectUrl) {
    refresh();
    return { status: "success", message: "WhatsApp já está conectado." };
  }
  redirect(connectUrl);
}

/** Coexy does not notify connection changes: poll the channel on demand. */
export async function refreshCoexyChannelAction(): Promise<ChannelActionState> {
  const me = await requireManager();
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("channel_accounts")
    .select("id, provider_channel_id")
    .eq("organization_id", me.organizationId)
    .eq("provider", "coexy")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!account?.provider_channel_id) return { status: "error", message: "Nenhuma conexão Coexy encontrada." };

  try {
    const channel = await getCoexyClient().getChannel(account.provider_channel_id);
    await syncCoexyChannel(account.id, me.organizationId, channel);
    refresh();
    return channel.status === "active"
      ? { status: "success", message: "WhatsApp conectado. As mensagens novas vão aparecer na inbox." }
      : { status: "error", message: "A conexão ainda não foi concluída no Coexy." };
  } catch (e) {
    const code = e instanceof Error ? e.message : "unknown";
    logEvent("coexy.refresh_failed", { code: e instanceof CoexyApiError ? e.code : code }, "error");
    return {
      status: "error",
      message:
        code === "phone_already_connected"
          ? "Este número já está conectado em outro negócio."
          : "Não foi possível consultar o Coexy agora.",
    };
  }
}
