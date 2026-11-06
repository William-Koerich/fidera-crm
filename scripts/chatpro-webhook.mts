/**
 * Points the ChatPro instance's webhook at this app. The CRM does this by
 * itself in Ajustes -> Canais; this is only for setting it from the terminal.
 *
 * Usage: npm run chatpro:webhook -- https://your-app
 * (CHATPRO_PANEL_EMAIL, CHATPRO_PANEL_PASSWORD, CHATPRO_INSTANCE_ID and
 * CHATPRO_WEBHOOK_SECRET in .env.local)
 */
import { ChatProPanel } from "../src/lib/channels/chatpro/panel.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function main(): Promise<void> {
  const appUrl = process.argv[2]?.replace(/\/$/, "");
  if (!appUrl?.startsWith("https://")) throw new Error("Pass the public https address of the app.");

  const instanceId = required("CHATPRO_INSTANCE_ID");
  const secret = required("CHATPRO_WEBHOOK_SECRET");
  const panel = new ChatProPanel({ email: required("CHATPRO_PANEL_EMAIL"), password: required("CHATPRO_PANEL_PASSWORD") });
  await panel.setWebhook(
    instanceId,
    `${appUrl}/api/webhooks/chatpro/${encodeURIComponent(instanceId)}?token=${encodeURIComponent(secret)}`,
  );
  console.log(`Webhook configured: ${appUrl}/api/webhooks/chatpro/${instanceId}?token=***`);
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
