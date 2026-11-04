import "server-only";
import { getWhatsAppProviderName, type ChannelProviderName } from "@/lib/env";
import { MockChannelProvider } from "./mock-provider";
import type { ChannelProvider } from "./types";

export type * from "./types";

const instances = new Map<ChannelProviderName, ChannelProvider>();

/** Provider by name, e.g. the one recorded on a stored webhook event. */
export function getProviderByName(name: ChannelProviderName): ChannelProvider {
  const existing = instances.get(name);
  if (existing) return existing;
  let provider: ChannelProvider;
  switch (name) {
    case "mock":
      provider = new MockChannelProvider();
      break;
    case "meta":
      throw new Error("WHATSAPP_PROVIDER=meta is not implemented yet.");
  }
  instances.set(name, provider);
  return provider;
}

/** Provider selected by WHATSAPP_PROVIDER (default: mock). */
export function getWhatsAppProvider(): ChannelProvider {
  return getProviderByName(getWhatsAppProviderName());
}
