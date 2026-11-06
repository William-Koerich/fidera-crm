import "server-only";
import { ChatProPanel } from "./panel";
import { ChatProChannelProvider } from "./provider";

/** ChatPro settings. One instance per deployment, owned by one business. */
export function getChatProConfig() {
  return {
    instanceId: process.env.CHATPRO_INSTANCE_ID ?? "",
    token: process.env.CHATPRO_TOKEN ?? "",
    chatToken: process.env.CHATPRO_CHAT_TOKEN ?? "",
    webhookSecret: process.env.CHATPRO_WEBHOOK_SECRET ?? "",
    organizationId: process.env.CHATPRO_ORGANIZATION_ID ?? "",
  };
}

export function getChatProProvider(): ChatProChannelProvider {
  const { token, chatToken } = getChatProConfig();
  return new ChatProChannelProvider({ token, chatToken, baseUrl: process.env.CHATPRO_API_URL });
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
export function getChatProWebhookUrl(): { url: string; isPublic: boolean } {
  const { instanceId, webhookSecret } = getChatProConfig();
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? (vercelHost ? `https://${vercelHost}` : "http://localhost:3000")).replace(/\/$/, "");
  return {
    url: `${origin}/api/webhooks/chatpro/${encodeURIComponent(instanceId)}?token=${encodeURIComponent(webhookSecret)}`,
    isPublic: origin.startsWith("https://"),
  };
}
