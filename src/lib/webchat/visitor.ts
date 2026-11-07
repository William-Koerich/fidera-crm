import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "../channels/phone";

export const MAX_VISITOR_MESSAGE = 2000;
/** Per visitor, against someone holding Enter. */
export const MAX_MESSAGES_PER_MINUTE = 8;
/** Per website, against a script flooding the inbox. */
export const MAX_MESSAGES_PER_HOUR = 300;

const VISITOR_ID = /^[0-9a-f-]{36}$/;

/**
 * Proves a visitor id was issued by this server for this chat, so nobody reads another visitor's
 * conversation by guessing ids. Null secret: the website chat is off.
 */
export function visitorToken(secret: string, chatKey: string, visitorId: string): string {
  return createHmac("sha256", secret).update(`${chatKey}:${visitorId}`).digest("base64url");
}

export function isValidVisitor(secret: string, chatKey: string, visitorId: unknown, token: unknown): visitorId is string {
  if (typeof visitorId !== "string" || typeof token !== "string" || !VISITOR_ID.test(visitorId)) return false;
  const expected = Buffer.from(visitorToken(secret, chatKey, visitorId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function parseVisitorMessage(body: unknown):
  | { ok: true; text: string; name: string | null; phone: string | null }
  | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const { text, name, phone } = body as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "empty" };
  if (text.length > MAX_VISITOR_MESSAGE) return { ok: false, error: "too_long" };
  const cleanName = typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  const cleanPhone = typeof phone === "string" ? normalizePhone(phone) : null;
  return { ok: true, text: text.trim(), name: cleanName || null, phone: cleanPhone };
}

/** "Chat do site" key: public, but long enough not to be guessed. */
export const CHAT_KEY = /^[0-9a-f]{32}$/;
