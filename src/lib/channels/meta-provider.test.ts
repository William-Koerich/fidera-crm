import { describe, expect, it, vi } from "vitest";
import { CoexyChannelProvider, MetaChannelProvider, isDisconnectionError } from "./meta-provider";
import { inboundText } from "./whatsapp/fixtures";

const input = {
  channel: "whatsapp" as const,
  accountExternalId: "200000000000001",
  to: "554899990000",
  type: "text" as const,
  body: "Olá!",
};

function provider(fetchImpl: typeof fetch) {
  return new MetaChannelProvider({
    getAccessToken: async () => "TOKEN",
    fetch: fetchImpl,
    now: () => new Date("2026-11-05T10:00:00Z"),
  });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("MetaChannelProvider", () => {
  it("sends a text with the documented request shape", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json(200, {
        messaging_product: "whatsapp",
        contacts: [{ input: "554899990000", wa_id: "554899990000" }],
        messages: [{ id: "wamid.OK" }],
      }),
    );
    const result = await provider(fetchMock).sendMessage(input);
    expect(result).toEqual({ ok: true, externalMessageId: "wamid.OK", acceptedAt: new Date("2026-11-05T10:00:00Z") });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v23.0/200000000000001/messages");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(String(init?.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "554899990000",
      type: "text",
      text: { body: "Olá!", preview_url: false },
    });
  });

  it("maps Graph errors and marks only transient ones as retryable", async () => {
    const outside = await provider(async () => json(400, { error: { code: 131047, message: "Re-engagement" } })).sendMessage(
      input,
    );
    expect(outside).toMatchObject({ ok: false, errorCode: "131047", retryable: false });

    const throttled = await provider(async () => json(429, { error: { code: 130429, message: "Rate limit" } })).sendMessage(
      input,
    );
    expect(throttled).toMatchObject({ ok: false, errorCode: "130429", retryable: true });

    const http = await provider(async () => new Response("bad gateway", { status: 502 })).sendMessage(input);
    expect(http).toMatchObject({ ok: false, errorCode: "http_502", retryable: true });
  });

  it("reports network failures as retryable", async () => {
    const result = await provider(async () => {
      throw new TypeError("fetch failed");
    }).sendMessage(input);
    expect(result).toMatchObject({ ok: false, errorCode: "network_error", retryable: true });
  });

  it("downloads media in two steps with the same token", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      String(url).startsWith("https://graph.facebook.com/")
        ? json(200, { url: "https://lookaside.example/media/1", mime_type: "image/jpeg", id: "media-1" })
        : new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const media = await provider(fetchMock).downloadMedia({ accountExternalId: "200000000000001", mediaId: "media-1" });
    expect(media.mimeType).toBe("image/jpeg");
    expect(new Uint8Array(media.data)).toEqual(new Uint8Array([1, 2, 3]));
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://graph.facebook.com/v23.0/media-1?phone_number_id=200000000000001",
    );
    expect((fetchMock.mock.calls[1]![1]?.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN");
  });

  it("Coexy goes through the meta-proxy with the channel token and an idempotency key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(200, { messages: [{ id: "wamid.CX" }] }));
    const coexy = new CoexyChannelProvider({ getAccessToken: async () => "CHANNEL_TOKEN", fetch: fetchMock });
    const result = await coexy.sendMessage({ ...input, idempotencyKey: "msg-1" });
    expect(result).toMatchObject({ ok: true, externalMessageId: "wamid.CX" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.coexy.com.br/functions/v1/meta-proxy/200000000000001/messages");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer CHANNEL_TOKEN");
    expect(JSON.parse(String(init?.body)).idempotency_key).toBe("msg-1");
  });

  it("Coexy disconnection errors are not retryable and are detected", async () => {
    const coexy = new CoexyChannelProvider({
      getAccessToken: async () => "T",
      fetch: async () => json(503, { code: "CHANNEL_DISCONNECTED", message: "reconnect via connect_url" }),
    });
    const result = await coexy.sendMessage(input);
    expect(result).toMatchObject({ ok: false, errorCode: "CHANNEL_DISCONNECTED", retryable: false });
    expect(isDisconnectionError("CHANNEL_DISCONNECTED")).toBe(true);
    expect(isDisconnectionError("131047")).toBe(false);
  });

  it("Meta direct sends never include Coexy's idempotency_key", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(200, { messages: [{ id: "wamid.M" }] }));
    await provider(fetchMock).sendMessage({ ...input, idempotencyKey: "msg-1" });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).not.toHaveProperty("idempotency_key");
  });

  it("parses webhooks with the shared Cloud API parser", () => {
    const events = provider(vi.fn()).parseWebhook(inboundText({ from: "5548999990000", body: "Oi", id: "wamid.1" }));
    expect(events[0]).toMatchObject({ kind: "message", externalMessageId: "wamid.1" });
  });
});
