import type { NextRequest } from "next/server";
import { getWhatsAppProviderName } from "@/lib/env";
import { handleWhatsAppWebhook } from "@/lib/webhooks/handler";

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

/** Direct Meta webhooks (X-Hub-Signature-256), or mock deliveries in mock mode. */
export async function POST(request: NextRequest) {
  const name = getWhatsAppProviderName();
  if (name === "chatpro") return new Response("Not found", { status: 404 });
  return handleWhatsAppWebhook(request, name, "x-hub-signature-256");
}
