import { createHash } from "node:crypto";
import { verifySignature } from "@/lib/channels/signature";
import type { Channel } from "@/lib/channels/types";
import type { ChannelProviderName } from "@/lib/env";

export interface StoredEventInput {
  provider: ChannelProviderName;
  channel: Channel;
  dedupeKey: string;
  payload: unknown;
}

export interface WebhookEventStore {
  /** Inserts the raw event. Returns null when it was already stored. */
  insertEvent(event: StoredEventInput): Promise<{ id: string } | null>;
}

export interface ReceiveInput {
  provider: ChannelProviderName;
  channel: Channel;
  rawBody: string;
  signature: string | null;
  secret: string;
}

export type ReceiveResult =
  | { status: 200; eventId: string; duplicate: false }
  | { status: 200; eventId: null; duplicate: true }
  | { status: 400 | 401; eventId: null; duplicate: false };

/**
 * Validates and stores a webhook delivery. Fast path only: processing
 * happens afterwards (after() / queue). The dedupe key is the SHA-256 of
 * the raw body, so a retried delivery is stored once.
 */
export async function receiveWebhook(input: ReceiveInput, store: WebhookEventStore): Promise<ReceiveResult> {
  if (!verifySignature(input.rawBody, input.signature, input.secret)) {
    return { status: 401, eventId: null, duplicate: false };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, eventId: null, duplicate: false };
  }

  const dedupeKey = createHash("sha256").update(input.rawBody).digest("hex");
  const stored = await store.insertEvent({ provider: input.provider, channel: input.channel, dedupeKey, payload });
  return stored
    ? { status: 200, eventId: stored.id, duplicate: false }
    : { status: 200, eventId: null, duplicate: true };
}
