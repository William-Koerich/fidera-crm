/**
 * Read-only diagnosis of the ChatPro Painel API: shows the shape of the
 * instance list, whose success format is not documented, with values masked.
 * Creates nothing and changes nothing.
 *
 * Usage (CHATPRO_PANEL_EMAIL and CHATPRO_PANEL_PASSWORD in .env.local):
 *   npm run chatpro:instances
 */
import { ChatProPanel } from "../src/lib/channels/chatpro/panel.ts";

function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 5).map(mask);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mask(v)]));
  }
  if (typeof value === "string") return value.length > 4 ? `${value.slice(0, 3)}*** (${value.length} chars)` : "***";
  return value;
}

async function main(): Promise<void> {
  const email = process.env.CHATPRO_PANEL_EMAIL;
  const password = process.env.CHATPRO_PANEL_PASSWORD;
  if (!email || !password) throw new Error("Missing CHATPRO_PANEL_EMAIL or CHATPRO_PANEL_PASSWORD.");
  const result = await new ChatProPanel({ email, password }).listInstances();
  console.log(JSON.stringify(mask(result), null, 2));
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
