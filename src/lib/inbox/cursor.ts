/** Keyset cursor for (timestamp, id) descending pagination. */
export interface Cursor {
  at: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.at, cursor.id])).toString("base64url");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [at, id] = parsed as unknown[];
    if (typeof at !== "string" || typeof id !== "string" || !UUID.test(id) || Number.isNaN(Date.parse(at))) {
      return null;
    }
    return { at: new Date(at).toISOString(), id };
  } catch {
    return null;
  }
}

/** PostgREST `or` filter for rows strictly after the cursor in (column desc, id desc) order. */
export function afterCursorFilter(column: string, cursor: Cursor): string {
  return `${column}.lt.${cursor.at},and(${column}.eq.${cursor.at},id.lt.${cursor.id})`;
}
