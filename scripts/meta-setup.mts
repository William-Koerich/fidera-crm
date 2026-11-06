/**
 * One-time setup of a number already added and verified in WhatsApp Manager:
 * registers it on Cloud API and subscribes the app to the WhatsApp account.
 *
 * Usage (values in .env.local):
 *   META_REGISTER_PIN=123456 npm run meta:setup
 *
 * The PIN is the number's 6-digit two-step verification PIN: use the existing
 * one, or the value sent here becomes the new PIN. Meta allows 10 registration
 * requests per number in 72 hours (error 133016), so do not run this in a loop.
 */
const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION ?? "v23.0";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function post(path: string, token: string, body?: unknown): Promise<void> {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await response.json().catch(() => null)) as { error?: { code?: number; message?: string } } | null;
  if (!response.ok) {
    throw new Error(`${path} failed: ${json?.error?.code ?? response.status} ${json?.error?.message ?? ""}`.trim());
  }
}

async function main(): Promise<void> {
  const token = required("META_WHATSAPP_TOKEN");
  const phoneNumberId = required("META_PHONE_NUMBER_ID");
  const wabaId = required("META_WABA_ID");
  const pin = required("META_REGISTER_PIN");
  if (!/^\d{6}$/.test(pin)) throw new Error("META_REGISTER_PIN must have exactly 6 digits.");

  await post(`${encodeURIComponent(phoneNumberId)}/register`, token, { messaging_product: "whatsapp", pin });
  console.log("Number registered on Cloud API.");

  await post(`${encodeURIComponent(wabaId)}/subscribed_apps`, token);
  console.log("App subscribed to the WhatsApp account webhooks.");
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
