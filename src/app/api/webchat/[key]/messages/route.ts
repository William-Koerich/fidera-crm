import { randomUUID } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { runAiAgent } from "@/lib/ai/agent/runner";
import type { NormalizedEvent } from "@/lib/channels/types";
import type { Json } from "@/lib/supabase/database.types";
import { logEvent } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/server";
import { findChat, findVisitorConversation, webchatSecret } from "@/lib/webchat/server";
import { MAX_MESSAGES_PER_HOUR, MAX_MESSAGES_PER_MINUTE, isValidVisitor, parseVisitorMessage } from "@/lib/webchat/visitor";

async function authorize(request: NextRequest, key: string, visitorId: unknown, token: unknown) {
  const secret = webchatSecret();
  if (!secret) return { error: Response.json({ error: "disabled" }, { status: 503 }) } as const;
  const chat = await findChat(key);
  if (!chat) return { error: Response.json({ error: "not_found" }, { status: 404 }) } as const;
  if (!isValidVisitor(secret, key, visitorId, token)) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) } as const;
  return { chat, visitorId: visitorId as string } as const;
}

/** The visitor's own conversation, newest last. Notes and failed sends are not included. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/webchat/[key]/messages">) {
  const { key } = await params;
  const query = request.nextUrl.searchParams;
  const auth = await authorize(request, key, query.get("visitorId"), query.get("token"));
  if ("error" in auth) return auth.error;

  const conversationId = await findVisitorConversation(auth.chat, auth.visitorId);
  if (!conversationId) return Response.json({ messages: [] }, { headers: { "Cache-Control": "no-store" } });

  const { data } = await createAdminClient()
    .from("messages")
    .select("id, direction, body, occurred_at")
    .eq("conversation_id", conversationId)
    .not("status", "in", "(failed,pending)")
    .not("body", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(100);
  const messages = (data ?? []).reverse().map((m) => ({
    id: m.id,
    from: m.direction === "inbound" ? "visitor" : "team",
    text: m.body,
    at: m.occurred_at,
  }));
  return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: RouteContext<"/api/webchat/[key]/messages">) {
  const { key } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const auth = await authorize(request, key, body?.visitorId, body?.token);
  if ("error" in auth) return auth.error;
  const parsed = parseVisitorMessage(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const admin = createAdminClient();
  const now = Date.now();
  const conversationId = await findVisitorConversation(auth.chat, auth.visitorId);
  const [perVisitor, perChat] = await Promise.all([
    conversationId
      ? admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversationId)
          .eq("direction", "inbound")
          .gte("occurred_at", new Date(now - 60_000).toISOString())
      : Promise.resolve({ count: 0 }),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("channel_account_id", auth.chat.accountId)
      .eq("direction", "inbound")
      .gte("occurred_at", new Date(now - 3_600_000).toISOString()),
  ]);
  if ((perVisitor.count ?? 0) >= MAX_MESSAGES_PER_MINUTE || (perChat.count ?? 0) >= MAX_MESSAGES_PER_HOUR) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const event: NormalizedEvent = {
    kind: "message",
    channel: "webchat",
    accountExternalId: key,
    direction: "inbound",
    origin: "customer",
    contact: { externalId: auth.visitorId, phoneNormalized: parsed.phone, profileName: parsed.name },
    externalMessageId: `webchat.${randomUUID()}`,
    type: "text",
    body: parsed.text,
    mediaExternalId: null,
    mediaMimeType: null,
    occurredAt: new Date(now),
  };
  const { error } = await admin.rpc("ingest_events", {
    p_provider: "webchat",
    p_events: JSON.parse(JSON.stringify([event])) as Json,
  });
  if (error) {
    logEvent("webchat.ingest_failed", { code: error.code }, "error");
    return Response.json({ error: "unavailable" }, { status: 500 });
  }
  // The AI attendant answers after the response: the visitor's message shows at once.
  after(() =>
    runAiAgent(admin, "webchat", [event]).catch((e: unknown) => {
      logEvent("ai_agent.failed", { error: e instanceof Error ? e.message : "unknown" }, "error");
    }),
  );
  return Response.json({ ok: true });
}
