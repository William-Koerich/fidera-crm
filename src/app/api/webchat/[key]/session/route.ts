import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { findChat, webchatSecret } from "@/lib/webchat/server";
import { isValidVisitor, visitorToken } from "@/lib/webchat/visitor";

/** Gives a visitor an id the server signs, or confirms the one they already have. */
export async function POST(request: NextRequest, { params }: RouteContext<"/api/webchat/[key]/session">) {
  const { key } = await params;
  const secret = webchatSecret();
  if (!secret) return Response.json({ error: "disabled" }, { status: 503 });
  const chat = await findChat(key);
  if (!chat) return Response.json({ error: "not_found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { visitorId?: unknown; token?: unknown };
  if (isValidVisitor(secret, key, body.visitorId, body.token)) {
    return Response.json({ visitorId: body.visitorId, token: body.token, businessName: chat.businessName });
  }
  const visitorId = randomUUID();
  return Response.json({ visitorId, token: visitorToken(secret, key, visitorId), businessName: chat.businessName });
}
