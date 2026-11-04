import { createHmac, timingSafeEqual } from "node:crypto";

/** Value for the X-Hub-Signature-256 header: "sha256=<hex hmac of the raw body>". */
export function signBody(rawBody: string | Uint8Array, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

/**
 * Validates X-Hub-Signature-256 against the RAW request body (never a
 * re-serialized JSON), in constant time.
 */
export function verifySignature(
  rawBody: string | Uint8Array,
  header: string | null | undefined,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(signBody(rawBody, secret));
  const received = Buffer.from(header.trim());
  return expected.length === received.length && timingSafeEqual(expected, received);
}
