import "server-only";
import { getProviderByName } from "@/lib/channels";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient, type AdminClient } from "@/lib/supabase/server";
import { refreshStaleProfiles } from "@/lib/contacts/profile-sync";
import { logEvent } from "@/lib/log";
import { runAutoReplies } from "@/lib/replies/auto-reply";
import { supabaseAutoReplyStore } from "@/lib/replies/auto-reply-store";
import { fetchPendingMedia } from "./media";

/** History syncs can carry thousands of messages: ingest them in batches. */
export const INGEST_BATCH_SIZE = 500;

interface IngestSummary {
  inserted: number;
  duplicates: number;
  statuses: number;
  skipped: number;
  organization_ids: string[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Claims due webhook events (optionally specific ids), normalizes them with
 * the provider parser and applies them through crm.ingest_events.
 * Safe to run concurrently: claiming uses SKIP LOCKED with a lease.
 */
export async function processWebhookEvents(
  opts: { ids?: string[]; limit?: number } = {},
  admin: AdminClient = createAdminClient(),
): Promise<{ processed: number; failed: number }> {
  const { data: claimed, error } = await admin.rpc("claim_webhook_events", {
    p_limit: opts.limit ?? 10,
    p_ids: opts.ids,
  });
  if (error) throw new Error(`claim_webhook_events failed: ${error.message}`);

  let processed = 0;
  let failed = 0;

  for (const event of claimed ?? []) {
    const started = Date.now();
    try {
      const provider = getProviderByName(event.provider);
      const normalized = provider.parseWebhook(event.payload);
      const totals = { inserted: 0, duplicates: 0, statuses: 0, skipped: 0 };
      let organizationId: string | undefined;

      for (const batch of chunk(normalized, INGEST_BATCH_SIZE)) {
        const { data, error: ingestError } = await admin.rpc("ingest_events", {
          p_provider: event.provider,
          p_events: JSON.parse(JSON.stringify(batch)) as Json,
        });
        if (ingestError) throw new Error(`ingest_events: ${ingestError.message}`);
        const summary = data as unknown as IngestSummary;
        totals.inserted += summary.inserted;
        totals.duplicates += summary.duplicates;
        totals.statuses += summary.statuses;
        totals.skipped += summary.skipped;
        organizationId ??= summary.organization_ids[0];
      }

      const { error: completeError } = await admin.rpc("complete_webhook_event", {
        p_id: event.id,
        p_organization_id: organizationId,
      });
      if (completeError) throw new Error(`complete_webhook_event: ${completeError.message}`);
      processed += 1;
      logEvent("webhook.processed", {
        eventId: event.id,
        attempts: event.attempts,
        events: normalized.length,
        ...totals,
        ms: Date.now() - started,
      });

      // After the event is complete: a failed auto reply must not make the webhook retry.
      await runAutoReplies(normalized, provider, supabaseAutoReplyStore(admin, event.provider), {
        onOutcome: (outcome) => logEvent("auto_reply.outcome", { eventId: event.id, outcome }, outcome === "sent" ? "info" : "warn"),
        onError: (e) =>
          logEvent("auto_reply.failed", { eventId: event.id, error: e instanceof Error ? e.message : "unknown" }, "error"),
      });
      await refreshStaleProfiles(admin, event.provider, normalized).catch((e: unknown) => {
        logEvent("contact.profile_failed", { eventId: event.id, error: e instanceof Error ? e.message : "unknown" }, "warn");
      });
    } catch (e) {
      failed += 1;
      const message = e instanceof Error ? e.message : "unknown error";
      await admin.rpc("complete_webhook_event", { p_id: event.id, p_error: message });
      logEvent("webhook.failed", { eventId: event.id, attempts: event.attempts, error: message }, "error");
    }
  }

  if (processed > 0) {
    try {
      await fetchPendingMedia(admin);
    } catch (e) {
      logEvent("media.batch_failed", { error: e instanceof Error ? e.message : "unknown" }, "warn");
    }
  }

  return { processed, failed };
}
