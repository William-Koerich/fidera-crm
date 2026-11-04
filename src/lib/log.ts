/**
 * Structured logs. Never pass message bodies, tokens, phone numbers or other
 * personal data here: only ids, counts and error codes.
 */
export function logEvent(
  name: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
  level: "info" | "warn" | "error" = "info",
): void {
  const line = JSON.stringify({ level, event: name, at: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
