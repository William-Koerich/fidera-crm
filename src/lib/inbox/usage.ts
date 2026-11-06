import "server-only";
import { estimateSendCost } from "@/lib/billing/pricing";
import { logEvent } from "@/lib/log";
import type { Enums } from "@/lib/supabase/database.types";
import type { AdminClient } from "@/lib/supabase/server";

/** usage_ledger is server-only: records the estimated cost of a send. Only Meta charges per message. */
export async function recordSendUsage(
  admin: AdminClient,
  input: {
    organizationId: string;
    accountId: string;
    provider: Enums<"channel_provider">;
    messageId: string;
    now: Date;
  },
): Promise<void> {
  const { now } = input;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count } = await admin
    .from("usage_ledger")
    .select("id", { count: "exact", head: true })
    .eq("channel_account_id", input.accountId)
    .eq("category", "service")
    .gte("occurred_at", monthStart);
  const { error } = await admin.from("usage_ledger").insert({
    organization_id: input.organizationId,
    channel_account_id: input.accountId,
    message_id: input.messageId,
    category: "service",
    estimated_cost: input.provider === "meta" ? estimateSendCost("service", count ?? 0) : 0,
    occurred_at: now.toISOString(),
  });
  if (error) logEvent("usage_ledger.insert_failed", { messageId: input.messageId }, "error");
}
