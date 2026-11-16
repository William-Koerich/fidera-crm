/**
 * Keys of one ChatPro instance. Each business has its own instance; its two keys are
 * stored together, as JSON, in the channel account's Vault secret
 * (crm.set_channel_token). The instance in CHATPRO_INSTANCE_ID keeps using the keys
 * from env.
 */
export interface ChatProCredentials {
  /** Connection key (status, QR Code, disconnect). */
  token: string;
  /** ChatPro Chat key (messages, sessions, team). */
  chatToken: string;
}

export type ChatProCredentialResolver = (instanceId: string) => Promise<ChatProCredentials>;

export const NO_CREDENTIALS: ChatProCredentials = { token: "", chatToken: "" };

export function serializeChatProCredentials(credentials: ChatProCredentials): string {
  return JSON.stringify({ token: credentials.token, chatToken: credentials.chatToken });
}

export function parseChatProCredentials(raw: unknown): ChatProCredentials | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const { token, chatToken } = value as Record<string, unknown>;
    if (typeof token !== "string" || !token) return null;
    return { token, chatToken: typeof chatToken === "string" ? chatToken : "" };
  } catch {
    return null;
  }
}

/** Fixed keys, for the env instance and for tests. */
export const fixedCredentials =
  (credentials: ChatProCredentials): ChatProCredentialResolver =>
  async () =>
    credentials;
