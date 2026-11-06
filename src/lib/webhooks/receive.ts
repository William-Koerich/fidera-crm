import { createHash, timingSafeEqual } from "node:crypto";
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

export interface ReceiveWithSecretInput {
  provider: ChannelProviderName;
  channel: Channel;
  /** Instance named in the webhook URL (the payload does not identify it). */
  instanceId: string;
  rawBody: string;
  /** Secret received in the webhook URL. */
  token: string | null;
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

function sameSecret(received: string | null, secret: string): boolean {
  if (!received || !secret) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/**
 * For providers without signed webhooks (ChatPro): authenticates with a secret
 * in the URL and stores { instanceId, event }, because the event itself does
 * not say which instance it belongs to.
 */
export async function receiveWithSecret(input: ReceiveWithSecretInput, store: WebhookEventStore): Promise<ReceiveResult> {
  if (!sameSecret(input.token, input.secret)) return { status: 401, eventId: null, duplicate: false };

  let event: unknown;
  try {
    event = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, eventId: null, duplicate: false };
  }

  const dedupeKey = createHash("sha256").update(`${input.instanceId}:${input.rawBody}`).digest("hex");
  const stored = await store.insertEvent({
    provider: input.provider,
    channel: input.channel,
    dedupeKey,
    payload: { instanceId: input.instanceId, event },
  });
  return stored
    ? { status: 200, eventId: stored.id, duplicate: false }
    : { status: 200, eventId: null, duplicate: true };
}
