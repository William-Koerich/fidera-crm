/**
 * One-time setup: creates the Coexy webhook that delivers every channel's
 * events to this app, and prints the hmac_secret (shown only once) to put in
 * COEXY_WEBHOOK_SECRET.
 *
 * Usage (needs COEXY_API_KEY and a public https URL of the deployed app):
 *   node --env-file=.env.local scripts/coexy-webhook.mts https://your-app.vercel.app
 *
 * Endpoint (Coexy spec): POST https://api.coexy.com.br/functions/v1/api/webhooks
 *   body { name, url, events } -> 201 { id, hmac_secret, ... }
 */

const EVENTS = ["messages", "smb_message_echoes", "message_echoes", "account_update"];

async function main(): Promise<void> {
  const apiKey = process.env.COEXY_API_KEY;
  const appUrl = process.argv[2];
  if (!apiKey) throw new Error("Missing COEXY_API_KEY.");
  if (!appUrl || !appUrl.startsWith("https://")) throw new Error("Pass the public https URL of the app.");

  const base = (process.env.COEXY_API_URL ?? "https://api.coexy.com.br/functions/v1/api").replace(/\/$/, "");
  const response = await fetch(`${base}/webhooks`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Fidera CRM",
      url: `${appUrl.replace(/\/$/, "")}/api/webhooks/coexy`,
      events: EVENTS,
    }),
  });
  const json = (await response.json().catch(() => null)) as { id?: string; hmac_secret?: string; code?: string } | null;
  if (!response.ok || !json?.hmac_secret) {
    throw new Error(`Coexy returned ${response.status} (${json?.code ?? "no hmac_secret"}).`);
  }
  console.log(`Webhook created: ${json.id}`);
  console.log("Set this as COEXY_WEBHOOK_SECRET (it will not be shown again):");
  console.log(json.hmac_secret);
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
