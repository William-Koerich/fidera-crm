export type Json = Record<string, unknown>;

export const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
export const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** The id at the top of the body or under one of the usual wrappers. */
export function findId(body: Json): string | null {
  const nested = [body.message, body.data, body.session, body.key, body.resposeMessage, body.responseMessage];
  return (
    text(body.id) ??
    text(body.messageId) ??
    text(body.message_id) ??
    nested.map((n) => (isObj(n) ? text(n.id) : null)).find(Boolean) ??
    null
  );
}
