"use server";

import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
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
  await createAdminClient()
    .from("channel_accounts")
    .upsert(
      {
        organization_id: me.organizationId,
        channel: "whatsapp",
        provider: "meta",
        external_account_id: phoneNumberId,
        external_business_id: process.env.META_WABA_ID ?? null,
        display_name: "WhatsApp do negócio",
        display_phone: process.env.META_DISPLAY_PHONE ?? null,
        status: "active",
        disconnected_reason: null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "provider,channel,external_account_id" },
    );
  refresh();
}
