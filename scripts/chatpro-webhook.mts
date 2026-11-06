/**
 * One-time setup: points the ChatPro instance's webhook at this app.
 *
 * Usage (needs the public https address of the app):
 *   CHATPRO_PANEL_EMAIL=... CHATPRO_PANEL_PASSWORD=... npm run chatpro:webhook -- https://your-app
 *
 * Endpoints (Painel API): POST /endpoint.php?action=token { email, senha } -> { success, token }
 * and POST /endpoint.php?action=alterar_webhook { code, new_webhook } -> { success, message }.
 * The panel credentials are used only for this call and are not stored.
 */
const PANEL_URL = "https://api.chatpro.com.br/painel/ws/endpoint.php";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function panel(action: string, body: unknown, token?: string): Promise<{ success?: boolean; message?: string; token?: string }> {
  const response = await fetch(`${PANEL_URL}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await response.json().catch(() => null)) as { success?: boolean; message?: string; token?: string } | null;
  if (!response.ok || !json?.success) {
    throw new Error(`ChatPro ${action} failed (${response.status}): ${json?.message ?? "no details"}`);
  }
  return json;
}

async function main(): Promise<void> {
  const appUrl = process.argv[2]?.replace(/\/$/, "");
  if (!appUrl?.startsWith("https://")) throw new Error("Pass the public https address of the app.");

  const instanceId = required("CHATPRO_INSTANCE_ID");
  const secret = required("CHATPRO_WEBHOOK_SECRET");
  const { token } = await panel("token", {
    email: required("CHATPRO_PANEL_EMAIL"),
    senha: required("CHATPRO_PANEL_PASSWORD"),
  });
  if (!token) throw new Error("ChatPro returned no panel token.");

  await panel(
    "alterar_webhook",
    {
      code: instanceId,
      new_webhook: `${appUrl}/api/webhooks/chatpro/${encodeURIComponent(instanceId)}?token=${encodeURIComponent(secret)}`,
    },
    token,
  );
  console.log(`Webhook configured: ${appUrl}/api/webhooks/chatpro/${instanceId}?token=***`);
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
