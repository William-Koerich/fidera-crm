/** Only same-site relative paths are accepted as redirect targets. */
export function safeNextPath(next: unknown, fallback = "/inbox"): string {
  if (
    typeof next !== "string" ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\") ||
    /[\r\n\t]/.test(next)
  ) {
    return fallback;
  }
  return next;
}
