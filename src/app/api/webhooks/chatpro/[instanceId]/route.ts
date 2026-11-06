import type { NextRequest } from "next/server";
import { getChatProConfig } from "@/lib/channels/chatpro/config";
import { logEvent } from "@/lib/log";
import { processAfterResponse } from "@/lib/webhooks/handler";
import { receiveWithSecret } from "@/lib/webhooks/receive";
import { supabaseEventStore } from "@/lib/webhooks/store";

export const maxDuration = 60;

/**
 * ChatPro webhook. Its documentation shows no signature, so the URL carries a
 * secret, and its payloads do not name the instance, so the URL carries that too:
 * /api/webhooks/chatpro/{instance}?token={CHATPRO_WEBHOOK_SECRET}
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/webhooks/chatpro/[instanceId]">) {
  const { instanceId } = await params;
  const result = await receiveWithSecret(
    {
      provider: "chatpro",
      channel: "whatsapp",
      instanceId,
      rawBody: await request.text(),
      token: request.nextUrl.searchParams.get("token"),
      secret: getChatProConfig().webhookSecret,
    },
    supabaseEventStore(),
  );

  logEvent("webhook.received", { provider: "chatpro", status: result.status, duplicate: result.duplicate });
  if (result.eventId) processAfterResponse(result.eventId);
  return new Response(result.status === 200 ? "EVENT_RECEIVED" : "Rejected", { status: result.status });
}
