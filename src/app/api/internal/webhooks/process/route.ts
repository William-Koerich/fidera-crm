import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { processWebhookEvents } from "@/lib/webhooks/process";

export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Processes pending / failed webhook events. Called by the pg_cron sweep
 * (crm_private.webhook_maintenance via pg_net) or by Vercel Cron.
 */
async function handle(request: NextRequest) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const result = await processWebhookEvents({ limit: 25 });
  return Response.json(result);
}

export const GET = handle;
export const POST = handle;
