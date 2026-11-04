import { after, type NextRequest } from "next/server";
import { getWhatsAppProviderName } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { processWebhookEvents } from "@/lib/webhooks/process";
import { receiveWebhook } from "@/lib/webhooks/receive";
import { supabaseEventStore, webhookSecret } from "@/lib/webhooks/store";

export const maxDuration = 60;

/** Meta webhook verification handshake (hub.challenge). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (
    expected &&
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === expected &&
    params.get("hub.challenge")
  ) {
    return new Response(params.get("hub.challenge"), { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * Receives WhatsApp webhooks: validate signature on the raw body, store once,
 * answer fast, process after the response. The pg_cron sweep retries anything
 * that fails or never got processed.
 */
export async function POST(request: NextRequest) {
  const provider = getWhatsAppProviderName();
  const rawBody = await request.text();

  const result = await receiveWebhook(
    {
      provider,
      channel: "whatsapp",
      rawBody,
      signature: request.headers.get("x-hub-signature-256"),
      secret: webhookSecret(provider),
    },
    supabaseEventStore(),
  );

  logEvent("webhook.received", { provider, status: result.status, duplicate: result.duplicate });

  if (result.eventId) {
    const id = result.eventId;
    after(async () => {
      try {
        await processWebhookEvents({ ids: [id] });
      } catch (e) {
        logEvent("webhook.after_failed", { eventId: id, error: e instanceof Error ? e.message : "unknown" }, "error");
      }
    });
  }

  return new Response(result.status === 200 ? "EVENT_RECEIVED" : "Rejected", { status: result.status });
}
