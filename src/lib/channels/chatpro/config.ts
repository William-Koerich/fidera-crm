import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { NO_CREDENTIALS, parseChatProCredentials, type ChatProCredentials } from "./credentials";
import { ChatProPanel } from "./panel";
import { ChatProChannelProvider } from "./provider";

/**
 * ChatPro settings from env: the first instance and the business that owns it.
 * Other businesses get their own instance, with keys in Vault (npm run chatpro:add).
 */
export function getChatProConfig() {
  return {
    instanceId: process.env.CHATPRO_INSTANCE_ID ?? "",
    token: process.env.CHATPRO_TOKEN ?? "",
    chatToken: process.env.CHATPRO_CHAT_TOKEN ?? "",
    webhookSecret: process.env.CHATPRO_WEBHOOK_SECRET ?? "",
    organizationId: process.env.CHATPRO_ORGANIZATION_ID ?? "",
  };
}

const KEY_TTL_MS = 5 * 60_000;
const keyCache = new Map<string, { keys: ChatProCredentials; until: number }>();

/** Keys of an instance: env for CHATPRO_INSTANCE_ID, Vault for the others. */
async function chatProKeys(instanceId: string): Promise<ChatProCredentials> {
  const env = getChatProConfig();
  if (env.instanceId && instanceId === env.instanceId) return { token: env.token, chatToken: env.chatToken };

  const cached = keyCache.get(instanceId);
  if (cached && cached.until > Date.now()) return cached.keys;
  const { data, error } = await createAdminClient().rpc("get_channel_token", {
    p_provider: "chatpro",
    p_external_account_id: instanceId,
  });
  if (error) throw new Error(`Could not read ChatPro keys (${error.code})`);
  const keys = parseChatProCredentials(data);
  if (!keys) return NO_CREDENTIALS;
  keyCache.set(instanceId, { keys, until: Date.now() + KEY_TTL_MS });
  return keys;
}

export function getChatProProvider(): ChatProChannelProvider {
  return new ChatProChannelProvider({ credentials: chatProKeys, baseUrl: process.env.CHATPRO_API_URL });
}

/**
 * The ChatPro instance of a business: the env one for CHATPRO_ORGANIZATION_ID,
 * otherwise the instance prepared for it with npm run chatpro:add.
 */
export async function getChatProInstanceFor(organizationId: string): Promise<string | null> {
  const env = getChatProConfig();
  if (env.instanceId && env.token && env.organizationId === organizationId) return env.instanceId;
  const { data } = await createAdminClient()
    .from("channel_accounts")
    .select("external_account_id")
    .eq("organization_id", organizationId)
    .eq("provider", "chatpro")
    .eq("channel", "whatsapp")
    .not("token_secret_id", "is", null)
    .limit(1)
    .maybeSingle();
  return data?.external_account_id ?? null;
}

/** Panel API client, when the account credentials are configured. */
export function getChatProPanel(): ChatProPanel | null {
  const email = process.env.CHATPRO_PANEL_EMAIL;
  const password = process.env.CHATPRO_PANEL_PASSWORD;
  return email && password ? new ChatProPanel({ email, password }) : null;
}

/**
 * Public address ChatPro should call, from server configuration only: request
 * headers must not decide where the webhook secret is sent.
 */
export function getChatProWebhookUrl(instanceId: string): { url: string; isPublic: boolean } {
  const { webhookSecret } = getChatProConfig();
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? (vercelHost ? `https://${vercelHost}` : "http://localhost:3000")).replace(/\/$/, "");
  return {
    url: `${origin}/api/webhooks/chatpro/${encodeURIComponent(instanceId)}?token=${encodeURIComponent(webhookSecret)}`,
    isPublic: origin.startsWith("https://"),
  };
}
