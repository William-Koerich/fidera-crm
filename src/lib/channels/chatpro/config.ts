import "server-only";
import { ChatProChannelProvider } from "./provider";

/** ChatPro settings. One instance per deployment, owned by one business. */
export function getChatProConfig() {
  return {
    instanceId: process.env.CHATPRO_INSTANCE_ID ?? "",
    token: process.env.CHATPRO_TOKEN ?? "",
    webhookSecret: process.env.CHATPRO_WEBHOOK_SECRET ?? "",
    organizationId: process.env.CHATPRO_ORGANIZATION_ID ?? "",
  };
}

export function getChatProProvider(): ChatProChannelProvider {
  return new ChatProChannelProvider({ token: getChatProConfig().token, baseUrl: process.env.CHATPRO_API_URL });
}
