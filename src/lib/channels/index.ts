import "server-only";
import { getWhatsAppProviderName, type ChannelProviderName } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import { CoexyChannelProvider, MetaChannelProvider, type TokenResolver } from "./meta-provider";
import { MockChannelProvider } from "./mock-provider";
import type { ChannelProvider } from "./types";

export type * from "./types";

/**
 * Token for a phone_number_id: the account's Vault secret first, then an env
 * fallback for local development with a single number
 * (META_WHATSAPP_TOKEN for the Meta test number, COEXY_CHANNEL_TOKEN for one
 * Coexy channel).
 */
function tokenResolver(provider: "meta" | "coexy", envName: string): TokenResolver {
  return async (accountExternalId) => {
    const { data } = await createAdminClient().rpc("get_channel_token", {
      p_provider: provider,
      p_external_account_id: accountExternalId,
    });
    const token = typeof data === "string" && data ? data : process.env[envName];
    if (!token) throw new Error(`No access token for this ${provider} account`);
    return token;
  };
}

const instances = new Map<ChannelProviderName, ChannelProvider>();

/** Provider by name, e.g. the one recorded on a stored webhook event or account. */
export function getProviderByName(name: ChannelProviderName): ChannelProvider {
  const existing = instances.get(name);
  if (existing) return existing;
  let provider: ChannelProvider;
  switch (name) {
    case "mock":
      provider = new MockChannelProvider();
      break;
    case "meta":
      provider = new MetaChannelProvider({
        getAccessToken: tokenResolver("meta", "META_WHATSAPP_TOKEN"),
        apiVersion: process.env.META_GRAPH_API_VERSION,
      });
      break;
    case "coexy":
      provider = new CoexyChannelProvider({
        getAccessToken: tokenResolver("coexy", "COEXY_CHANNEL_TOKEN"),
        baseUrl: process.env.COEXY_META_PROXY_URL,
      });
      break;
  }
  instances.set(name, provider);
  return provider;
}

/** Provider selected by WHATSAPP_PROVIDER (default: mock). */
export function getWhatsAppProvider(): ChannelProvider {
  return getProviderByName(getWhatsAppProviderName());
}
