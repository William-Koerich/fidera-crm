import "server-only";
import { after } from "next/server";
import { logEvent } from "@/lib/log";
import { processWebhookEvents } from "./process";
import { receiveWebhook } from "./receive";
import { supabaseEventStore, webhookSecret } from "./store";

/** Processes a stored event after the response is sent. */
export function processAfterResponse(id: string): void {
  after(async () => {
    try {
      await processWebhookEvents({ ids: [id] });
    } catch (e) {
      logEvent("webhook.after_failed", { eventId: id, error: e instanceof Error ? e.message : "unknown" }, "error");
    }
  });
}

/**
 * Shared POST handler: validate the signature on the raw body, store once,
 * answer fast, process after the response (the pg_cron sweep retries the rest).
 */
export async function handleWhatsAppWebhook(
  request: Request,
  provider: "mock" | "meta",
  signatureHeader: string,
): Promise<Response> {
  const rawBody = await request.text();
  const result = await receiveWebhook(
    {
      provider,
      channel: "whatsapp",
      rawBody,
      signature: request.headers.get(signatureHeader),
      secret: webhookSecret(provider),
    },
    supabaseEventStore(),
  );

  logEvent("webhook.received", { provider, status: result.status, duplicate: result.duplicate });

  if (result.eventId) processAfterResponse(result.eventId);

  return new Response(result.status === 200 ? "EVENT_RECEIVED" : "Rejected", { status: result.status });
}
