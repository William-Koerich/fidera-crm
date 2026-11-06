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
  new ChatProChannelProvider({
    token: "TOKEN",
    chatToken: "CHAT",
    fetch: fetchImpl,
    now: () => new Date("2026-11-06T10:00:00Z"),
  });

/** Answers the session lookup, then the send. */
const sendFlow = (sent: Response) =>
  vi.fn<typeof fetch>(async (url) =>
    String(url).endsWith("/sessions/getOrCreateByNumber") ? json(201, { id: "session-1", open: true }) : sent,
  );

describe("ChatProChannelProvider", () => {
  it("opens the session by number and sends through ChatPro Chat with its own key", async () => {
    const fetchMock = sendFlow(json(201, { id: "3EB0" }));
    expect(await provider(fetchMock).sendMessage(input)).toEqual({
      ok: true,
      externalMessageId: "3EB0",
      acceptedAt: new Date("2026-11-06T10:00:00Z"),
    });
    const [sessionUrl, sessionInit] = fetchMock.mock.calls[0]!;
    expect(sessionUrl).toBe("https://sparks.chatpro.com.br/sessions/getOrCreateByNumber");
    expect((sessionInit?.headers as Record<string, string>)["instance-token"]).toBe("CHAT");
    expect(JSON.parse(String(sessionInit?.body))).toEqual({
      instanceId: "chatpro-abc",
      number: "5511999999999",
      provider: "whatsapp",
    });
    const [sendUrl, sendInit] = fetchMock.mock.calls[1]!;
    expect(sendUrl).toBe("https://sparks.chatpro.com.br/messages/sendMessage");
    expect(JSON.parse(String(sendInit?.body))).toEqual({
      instanceId: "chatpro-abc",
      sessionId: "session-1",
      message: "Olá!",
      provider: "whatsapp",
    });
  });

  it("does not send when the session cannot be opened", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(201, {}));
    expect(await provider(fetchMock).sendMessage(input)).toMatchObject({ ok: false, errorCode: "chatpro_no_session" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an accepted send as sent even when the response has no id", async () => {
    const result = await provider(sendFlow(json(200, {}))).sendMessage({ ...input, idempotencyKey: "msg-1" });
    expect(result).toMatchObject({ ok: true, externalMessageId: "chatpro-local-msg-1" });
  });

  it("refuses to send without the ChatPro Chat key", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const noKey = new ChatProChannelProvider({ token: "TOKEN", chatToken: "", fetch: fetchMock });
    expect(await noKey.sendMessage(input)).toMatchObject({ ok: false, errorCode: "chatpro_chat_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the connection key and host for status", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json(200, { connected: true }));
    await provider(fetchMock).getStatus("chatpro-abc");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://oci.chatpro.com.br/chatpro-abc/api/v1/status");
    expect((init?.headers as Record<string, string>).Authorization).toBe("TOKEN");
  });

  it("reads validation errors sent as a list", async () => {
    expect(await provider(sendFlow(json(400, { message: ["message must be a string", "x"] }))).sendMessage(input)).toMatchObject({
      errorMessage: "message must be a string; x",
    });
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
