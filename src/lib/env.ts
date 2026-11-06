export const CHANNEL_PROVIDERS = ["mock", "meta", "chatpro"] as const;
export type ChannelProviderName = (typeof CHANNEL_PROVIDERS)[number];

/** Reads WHATSAPP_PROVIDER. Defaults to "mock" so the app works without a Meta account. */
export function getWhatsAppProviderName(
  env: Record<string, string | undefined> = process.env,
): ChannelProviderName {
  const value = (env.WHATSAPP_PROVIDER ?? "mock").trim().toLowerCase();
  if ((CHANNEL_PROVIDERS as readonly string[]).includes(value)) {
    return value as ChannelProviderName;
  }
  throw new Error(
    `Invalid WHATSAPP_PROVIDER "${value}". Use one of: ${CHANNEL_PROVIDERS.join(", ")}.`,
  );
}
