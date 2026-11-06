import { describe, expect, it, vi } from "vitest";
import { ChatProChannelProvider, ChatProRateLimitError } from "./provider";

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

  it("sends a file by address inside the session, with its caption", async () => {
    const fetchMock = sendFlow(json(201, { id: "3EB1" }));
    const result = await provider(fetchMock).sendMedia({
      channel: "whatsapp",
      accountExternalId: "chatpro-abc",
      to: "5511999999999",
      url: "https://files.example/a.jpg?token=x",
      mimeType: "image/jpeg",
      caption: "Olha o corte",
    });
    expect(result).toMatchObject({ ok: true, externalMessageId: "3EB1" });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("https://sparks.chatpro.com.br/messages/sendFileFromUrl");
    expect(JSON.parse(String(init?.body))).toEqual({
      instanceId: "chatpro-abc",
      provider: "whatsapp",
      sessionId: "session-1",
      url: "https://files.example/a.jpg?token=x",
      caption: "Olha o corte",
    });
  });

  it("leaves the caption out when there is none", async () => {
    const fetchMock = sendFlow(json(201, { id: "3EB2" }));
    await provider(fetchMock).sendMedia({ channel: "whatsapp", accountExternalId: "i", to: "5511", url: "https://f/a", mimeType: "image/png" });
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body))).not.toHaveProperty("caption");
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

  it("lists only 1:1 WhatsApp sessions", async () => {
    const sessions = await provider(async () =>
      json(201, [
        { id: "s1", lead_id: "l1", group: false, provider: "whatsapp" },
        { id: "s2", lead_id: "l2", group: true, provider: "whatsapp" },
        { id: "s3", lead_id: "l3", group: false, provider: "chatpro" },
      ]),
    ).listSessions("i");
    expect(sessions).toEqual([{ id: "s1", leadId: "l1" }]);
  });

  it("pages session messages up to the documented offset", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `m${i}` }));
    const fetchMock = vi.fn<typeof fetch>(async () => json(201, full));
    expect(await provider(fetchMock).getSessionMessages("i", "s1")).toHaveLength(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("signals the rate limit apart from other failures", async () => {
    await expect(provider(async () => json(429, {})).listSessions("i")).rejects.toBeInstanceOf(ChatProRateLimitError);
    await expect(provider(async () => json(429, {})).getLeadName("i", "l")).rejects.toBeInstanceOf(ChatProRateLimitError);
    await expect(provider(async () => json(401, {})).getSessionMessages("i", "s")).rejects.toThrow("failed (401)");
  });

  it("prefers the name set by hand for a lead", async () => {
    const name = provider(async () => json(201, { nome_personalizado: "Ana", push_name: "Aninha" }));
    expect(await name.getLeadName("i", "l")).toBe("Ana");
    expect(await provider(async () => json(201, { name: null })).getLeadName("i", "l")).toBeNull();
  });

  it("reads the profile and skips the lead lookup when it has everything", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json(200, { name: "Ana Souza", pushname: "Ana ✨", imgUrl: "https://pps.whatsapp.net/a.jpg" }),
    );
    expect(await provider(fetchMock).getContactProfile("i", "5511999999999")).toEqual({
      savedName: "Ana Souza",
      publicName: "Ana ✨",
      imageUrl: "https://pps.whatsapp.net/a.jpg",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe("https://oci.chatpro.com.br/i/api/v1/get_profile");
  });

  it("fills missing profile fields from the lead", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      String(url).includes("findByPhoneNumber")
        ? json(201, { name: "Ana", eul: "https://pps.whatsapp.net/b.jpg" })
        : json(200, { jid: "x" }),
    );
    expect(await provider(fetchMock).getContactProfile("i", "5511999999999")).toEqual({
      savedName: null,
      publicName: "Ana",
      imageUrl: "https://pps.whatsapp.net/b.jpg",
    });
  });

  it("knows nothing about privacy ids or numbers both services reject", async () => {
    const never = vi.fn<typeof fetch>();
    expect(await provider(never).getContactProfile("i", "123456789012345678")).toBeNull();
    expect(never).not.toHaveBeenCalled();
    expect(await provider(async () => json(400, {})).getContactProfile("i", "5511999999999")).toBeNull();
  });

  it("signals the rate limit on profile lookups", async () => {
    await expect(provider(async () => json(429, {})).getContactProfile("i", "5511999999999")).rejects.toBeInstanceOf(
      ChatProRateLimitError,
    );
  });

  it("downloads photos only from WhatsApp's host, as images of a sane size", async () => {
    const image = (bytes: number, type = "image/jpeg") =>
      vi.fn<typeof fetch>(async () => new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": type } }));
    expect((await provider(image(10)).downloadContactPhoto("https://pps.whatsapp.net/a")).mimeType).toBe("image/jpeg");
    await expect(provider(image(10)).downloadContactPhoto("https://evil.example/whatsapp.net")).rejects.toThrow("unexpected host");
    await expect(provider(image(10)).downloadContactPhoto("http://pps.whatsapp.net/a")).rejects.toThrow("unexpected host");
    await expect(provider(image(10, "text/html")).downloadContactPhoto("https://pps.whatsapp.net/a")).rejects.toThrow("not an image");
    await expect(provider(image(3 * 1024 * 1024)).downloadContactPhoto("https://pps.whatsapp.net/a")).rejects.toThrow("too large");
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
