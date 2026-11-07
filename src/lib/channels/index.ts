import { WebchatProvider } from "./webchat-provider";
import "server-only";
import { getWhatsAppProviderName } from "@/lib/env";
import type { Enums } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/server";
import { getChatProProvider } from "./chatpro/config";
import { MetaChannelProvider, type TokenResolver } from "./meta-provider";
import { MockChannelProvider } from "./mock-provider";
import type { ChannelProvider } from "./types";

export type * from "./types";

/**
 * Token for a phone_number_id: the account's Vault secret first, then
 * META_WHATSAPP_TOKEN as a fallback for local development with the Meta
 * test number.
 */
const metaToken: TokenResolver = async (accountExternalId) => {
  const { data } = await createAdminClient().rpc("get_channel_token", {
    p_provider: "meta",
    p_external_account_id: accountExternalId,
  });
  const token = typeof data === "string" && data ? data : process.env.META_WHATSAPP_TOKEN;
  if (!token) throw new Error("No access token for this Meta account");
  return token;
};

const instances = new Map<string, ChannelProvider>();

/**
 * Provider by name, e.g. the one recorded on a stored webhook event or a
 * channel account. ("coexy" remains in the database enum from an earlier
 * integration that was removed; it is rejected here.)
 */
export function getProviderByName(name: Enums<"channel_provider">): ChannelProvider {
  const existing = instances.get(name);
  if (existing) return existing;
  let provider: ChannelProvider;
  switch (name) {
    case "mock":
      provider = new MockChannelProvider();
      break;
    case "meta":
      provider = new MetaChannelProvider({ getAccessToken: metaToken, apiVersion: process.env.META_GRAPH_API_VERSION });
      break;
    case "chatpro":
      provider = getChatProProvider();
      break;
    case "webchat":
      provider = new WebchatProvider();
      break;
    case "coexy":
      throw new Error("The Coexy integration was removed. Use WHATSAPP_PROVIDER=mock, meta or chatpro.");
  }
  instances.set(name, provider);
  return provider;
}

/** Provider selected by WHATSAPP_PROVIDER (default: mock). */
export function getWhatsAppProvider(): ChannelProvider {
  return getProviderByName(getWhatsAppProviderName());
}
