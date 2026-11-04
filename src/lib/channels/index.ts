import "server-only";
import { getWhatsAppProviderName } from "@/lib/env";
import { MockChannelProvider } from "./mock-provider";
import type { ChannelProvider } from "./types";

export type * from "./types";

let cached: ChannelProvider | null = null;

/** Returns the WhatsApp provider selected by WHATSAPP_PROVIDER (default: mock). */
export function getWhatsAppProvider(): ChannelProvider {
  if (cached) return cached;
  const name = getWhatsAppProviderName();
  switch (name) {
    case "mock":
      cached = new MockChannelProvider();
      return cached;
    case "meta":
      throw new Error("WHATSAPP_PROVIDER=meta is not implemented yet (Phase 1, Meta test number step).");
  }
}
