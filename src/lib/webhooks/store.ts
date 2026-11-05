import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/server";
import type { WebhookEventStore } from "./receive";

/** Stores raw webhook events with the server-only admin client. */
export function supabaseEventStore(admin = createAdminClient()): WebhookEventStore {
  return {
    async insertEvent(e) {
      const { data, error } = await admin
        .from("webhook_events")
        .upsert(
          { provider: e.provider, channel: e.channel, dedupe_key: e.dedupeKey, payload: e.payload as Json },
          { onConflict: "provider,dedupe_key", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw new Error(`webhook_events insert failed: ${error.message}`);
      const row = data[0];
      return row ? { id: row.id } : null;
    },
  };
}

export function webhookSecret(provider: "mock" | "meta" | "coexy"): string {
  if (provider === "coexy") {
    const secret = process.env.COEXY_WEBHOOK_SECRET;
    if (!secret) throw new Error("Missing COEXY_WEBHOOK_SECRET.");
    return secret;
  }
  if (provider === "meta") {
    const secret = process.env.META_APP_SECRET;
    if (!secret) throw new Error("Missing META_APP_SECRET.");
    return secret;
  }
  const secret = process.env.MOCK_WEBHOOK_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("Missing MOCK_WEBHOOK_SECRET.");
  return "dev-mock-secret";
}
