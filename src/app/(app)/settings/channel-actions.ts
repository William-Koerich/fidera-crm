"use server";

import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Mock mode only: creates a fake WhatsApp number so the inbox works without Meta. */
export async function connectMockChannelAction(): Promise<void> {
  const me = await requireMembership();
  if (!canManage(me.role) || getWhatsAppProviderName() !== "mock") return;
  const supabase = await createClient();
  await supabase.from("channel_accounts").upsert(
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
