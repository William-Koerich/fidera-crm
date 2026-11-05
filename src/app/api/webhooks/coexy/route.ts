import type { NextRequest } from "next/server";
import { handleWhatsAppWebhook } from "@/lib/webhooks/handler";

export const maxDuration = 60;

/**
 * Coexy webhook: Meta Cloud API payloads passed through unchanged, signed with
 * "X-Coexy-Signature: sha256=<HMAC-SHA256 of the raw body>" using the
 * hmac_secret returned when the Coexy webhook was created (COEXY_WEBHOOK_SECRET).
 * Coexy waits at most 10s, so we answer right after storing the event.
 */
export async function POST(request: NextRequest) {
  return handleWhatsAppWebhook(request, "coexy", "x-coexy-signature");
}
