import { describe, expect, it, vi } from "vitest";
import { ChatProChannelProvider } from "./provider";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const input = {
  channel: "whatsapp" as const,
  accountExternalId: "chatpro-abc",
  to: "5511999999999",
  type: "text" as const,
  body: "Olá!",
};

const provider = (fetchImpl: typeof fetch) =>
  new ChatProChannelProvider({ token: "TOKEN", fetch: fetchImpl, now: () => new Date("2026-11-06T10:00:00Z") });

describe("ChatProChannelProvider", () => {
  it("sends text with the documented request and reads the response id", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json(201, { message: "Mensagem Enviada", resposeMessage: { id: "3EB0", timestamp: "1" }, status: true }),
    );
    expect(await provider(fetchMock).sendMessage(input)).toEqual({
      ok: true,
      externalMessageId: "3EB0",
      acceptedAt: new Date("2026-11-06T10:00:00Z"),
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://v5.chatpro.com.br/chatpro-abc/api/v1/send_message");
    expect((init?.headers as Record<string, string>).Authorization).toBe("TOKEN");
    expect(JSON.parse(String(init?.body))).toEqual({ number: "5511999999999", message: "Olá!" });
  });

  it("maps errors and retries only transient ones", async () => {
    expect(await provider(async () => json(401, { message: "Unauthorized" })).sendMessage(input)).toMatchObject({
      ok: false,
      errorCode: "chatpro_unauthorized",
      retryable: false,
    });
    expect(await provider(async () => json(400, { message: "não está cadastrado" })).sendMessage(input)).toMatchObject({
      errorCode: "http_400",
      retryable: false,
    });
    expect(await provider(async () => json(500, {})).sendMessage(input)).toMatchObject({ retryable: true });
    expect(
      await provider(async () => {
        throw new TypeError("fetch failed");
      }).sendMessage(input),
    ).toMatchObject({ errorCode: "network_error", retryable: true });
  });

  it("has no 24h reply window", () => {
    expect(provider(vi.fn()).getReplyWindow()).toMatchObject({ isOpen: true, endsAt: null });
  });

  it("reads the connection status", async () => {
    const status = await provider(async () => json(200, { connected: true, info: { Wid: "5511@c.us" } })).getStatus("i");
    expect(status).toEqual({ connected: true, wid: "5511@c.us" });
    expect((await provider(async () => json(200, { connected: false })).getStatus("i")).connected).toBe(false);
  });

  it("returns the QR Code as a data URL", async () => {
    expect(await provider(async () => json(200, { qr: "AAAA", status: true })).getQrCode("i")).toBe(
      "data:image/png;base64,AAAA",
    );
    expect(await provider(async () => json(200, { qr: "data:image/png;base64,BB" })).getQrCode("i")).toBe(
      "data:image/png;base64,BB",
    );
    await expect(provider(async () => json(200, {})).getQrCode("i")).rejects.toThrow("no QR Code");
  });

  it("downloads media without sending the instance token, and refuses non-https", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(new Uint8Array([1, 2]), { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    const media = await provider(fetchMock).downloadMedia({ accountExternalId: "i", mediaId: "https://files.example/a" });
    expect(media.mimeType).toBe("image/jpeg");
    expect(fetchMock.mock.calls[0]![1]?.headers).toBeUndefined();
    await expect(
      provider(fetchMock).downloadMedia({ accountExternalId: "i", mediaId: "http://169.254.169.254/" }),
    ).rejects.toThrow("non-https");
  });
});
