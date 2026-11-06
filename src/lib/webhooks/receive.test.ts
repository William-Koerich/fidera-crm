import { describe, expect, it } from "vitest";
import { signBody } from "@/lib/channels/signature";
import { inboundText } from "@/lib/channels/whatsapp/fixtures";
import { receiveWebhook, receiveWithSecret, type StoredEventInput, type WebhookEventStore } from "./receive";

function memoryStore() {
  const rows = new Map<string, StoredEventInput & { id: string }>();
  const store: WebhookEventStore = {
    async insertEvent(e) {
      if (rows.has(e.dedupeKey)) return null;
      const id = `evt-${rows.size + 1}`;
      rows.set(e.dedupeKey, { ...e, id });
      return { id };
    },
  };
  return { store, rows };
}

const secret = "s3cret";
const body = JSON.stringify(inboundText({ from: "5548999990000", body: "Oi", id: "wamid.1" }));
const base = { provider: "mock" as const, channel: "whatsapp" as const, rawBody: body, secret };

describe("receiveWebhook", () => {
  it("stores a correctly signed delivery once", async () => {
    const { store, rows } = memoryStore();
    const first = await receiveWebhook({ ...base, signature: signBody(body, secret) }, store);
    expect(first).toEqual({ status: 200, eventId: "evt-1", duplicate: false });
    const again = await receiveWebhook({ ...base, signature: signBody(body, secret) }, store);
    expect(again).toEqual({ status: 200, eventId: null, duplicate: true });
    expect(rows.size).toBe(1);
  });

  it("rejects bad or missing signatures without storing", async () => {
    const { store, rows } = memoryStore();
    expect((await receiveWebhook({ ...base, signature: null }, store)).status).toBe(401);
    expect((await receiveWebhook({ ...base, signature: signBody(body, "other") }, store)).status).toBe(401);
    expect(rows.size).toBe(0);
  });

  it("rejects signed but invalid JSON", async () => {
    const { store } = memoryStore();
    const raw = "not json";
    expect((await receiveWebhook({ ...base, rawBody: raw, signature: signBody(raw, secret) }, store)).status).toBe(400);
  });
});

describe("receiveWithSecret", () => {
  const input = { provider: "chatpro" as const, channel: "whatsapp" as const, instanceId: "chatpro-a", rawBody: '{"Type":"x"}', secret };

  it("stores the event once, wrapped with the instance from the URL", async () => {
    const { store, rows } = memoryStore();
    expect(await receiveWithSecret({ ...input, token: secret }, store)).toEqual({ status: 200, eventId: "evt-1", duplicate: false });
    expect(await receiveWithSecret({ ...input, token: secret }, store)).toEqual({ status: 200, eventId: null, duplicate: true });
    expect([...rows.values()][0]?.payload).toEqual({ instanceId: "chatpro-a", event: { Type: "x" } });
  });

  it("does not treat the same body from another instance as a duplicate", async () => {
    const { store, rows } = memoryStore();
    await receiveWithSecret({ ...input, token: secret }, store);
    await receiveWithSecret({ ...input, instanceId: "chatpro-b", token: secret }, store);
    expect(rows.size).toBe(2);
  });

  it("rejects a missing or wrong secret, and an unconfigured secret", async () => {
    const { store, rows } = memoryStore();
    expect((await receiveWithSecret({ ...input, token: null }, store)).status).toBe(401);
    expect((await receiveWithSecret({ ...input, token: "wrong" }, store)).status).toBe(401);
    expect((await receiveWithSecret({ ...input, token: "", secret: "" }, store)).status).toBe(401);
    expect(rows.size).toBe(0);
  });

  it("rejects invalid JSON", async () => {
    const { store } = memoryStore();
    expect((await receiveWithSecret({ ...input, rawBody: "nope", token: secret }, store)).status).toBe(400);
  });
});
