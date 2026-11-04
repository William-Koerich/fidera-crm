import { describe, expect, it } from "vitest";
import { signBody } from "@/lib/channels/signature";
import { inboundText } from "@/lib/channels/whatsapp/fixtures";
import { receiveWebhook, type StoredEventInput, type WebhookEventStore } from "./receive";

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
