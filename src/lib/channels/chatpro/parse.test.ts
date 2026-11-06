import { describe, expect, it } from "vitest";
import { contactFromJid, parseChatProHistory, parseChatProWebhook } from "./parse";

const instanceId = "chatpro-abc";
const wrap = (event: unknown) => ({ instanceId, event });

function apiEvent(overrides: { fromMe?: boolean; jid?: string; isSync?: boolean } = {}) {
  const jid = overrides.jid ?? "5511999999999@s.whatsapp.net";
  return {
    Type: "send_message",
    IsSync: overrides.isSync ?? false,
    Reprocessing: false,
    Body: {
      Info: {
        Id: "3EB0447D78381969537E06",
        RemoteJid: jid,
        SenderJid: "5511888888888@s.whatsapp.net",
        FromMe: overrides.fromMe ?? true,
        Timestamp: 1733861415,
        PushName: "Ana",
        Status: 0,
        Source: { key: { remoteJid: jid }, message: { conversation: "Msg de texto" } },
      },
      Text: "Msg de texto",
    },
  };
}

describe("parseChatProWebhook", () => {
  it("parses an outgoing text with the documented sample", () => {
    expect(parseChatProWebhook(wrap(apiEvent()))).toEqual([
      {
        kind: "message",
        channel: "whatsapp",
        accountExternalId: instanceId,
        direction: "outbound",
        origin: "business_app_echo",
        contact: { externalId: "5511999999999", phoneNormalized: "5511999999999", profileName: null },
        externalMessageId: "3EB0447D78381969537E06",
        type: "text",
        body: "Msg de texto",
        mediaExternalId: null,
        mediaMimeType: null,
        occurredAt: new Date(1733861415 * 1000),
      },
    ]);
  });

  it("treats FromMe=false as a customer message and uses the sender's name", () => {
    expect(parseChatProWebhook(wrap(apiEvent({ fromMe: false })))[0]).toMatchObject({
      direction: "inbound",
      origin: "customer",
      contact: { profileName: "Ana" },
    });
  });

  it("does not count a synced incoming message as a new one", () => {
    expect(parseChatProWebhook(wrap(apiEvent({ fromMe: false, isSync: true })))[0]).toMatchObject({ origin: "history" });
  });

  it("parses media with its URL, type and caption", () => {
    const event = {
      Type: "send_image_message",
      Body: {
        Info: {
          Id: "IMG1",
          RemoteJid: "5511999999999@s.whatsapp.net",
          FromMe: false,
          Timestamp: 1733861166,
          Source: { message: { imageMessage: { mimetype: "image/jpeg" } } },
        },
        Caption: "Esse corte",
      },
      FileType: "image/jpeg",
      Url: "https://files.example/image.jpeg",
    };
    expect(parseChatProWebhook(wrap(event))[0]).toMatchObject({
      type: "image",
      body: "Esse corte",
      mediaExternalId: "https://files.example/image.jpeg",
      mediaMimeType: "image/jpeg",
    });
  });

  it("ignores non-https media URLs", () => {
    const event = {
      Type: "send_image_message",
      Body: { Info: { Id: "I", RemoteJid: "5511999999999@c.us", FromMe: false, Timestamp: 1 } },
      Url: "http://169.254.169.254/latest",
    };
    expect(parseChatProWebhook(wrap(event))[0]).toMatchObject({ mediaExternalId: null });
  });

  it("parses delivery status from the documented ack array", () => {
    const ack = ["Msg", { cmd: "ack", id: "3AED", ack: 3, from: "a@c.us", to: "b@c.us", t: 1733518887, isSync: false }];
    expect(parseChatProWebhook(wrap(ack))).toEqual([
      {
        kind: "status",
        channel: "whatsapp",
        accountExternalId: instanceId,
        externalMessageId: "3AED",
        status: "read",
        occurredAt: new Date(1733518887 * 1000),
        errorCode: null,
      },
    ]);
    expect(parseChatProWebhook(wrap(["Msg", { cmd: "ack", id: "x", ack: 0 }]))).toEqual([]);
  });

  it("parses the chat product's received_message event", () => {
    const event = {
      event: "received_message",
      event_ts: "2025-03-17T20:19:25.448158",
      message_data: {
        id: "ID131231231",
        from_me: false,
        instance_id: "chatpro-fz5qbe2haz",
        message: "Pode ser às 09h",
        number: "5562999999999@s.whatsapp.net",
        ts_receive: "2025-03-17T20:19:25+01:00",
        url: null,
        file_type: null,
      },
    };
    expect(parseChatProWebhook(wrap(event))[0]).toMatchObject({
      accountExternalId: instanceId,
      direction: "inbound",
      type: "text",
      body: "Pode ser às 09h",
      externalMessageId: "ID131231231",
    });
  });

  it("ignores groups, broadcasts and malformed payloads", () => {
    expect(parseChatProWebhook(wrap(apiEvent({ jid: "120363000000@g.us" })))).toEqual([]);
    expect(parseChatProWebhook(wrap(apiEvent({ jid: "status@broadcast" })))).toEqual([]);
    expect(parseChatProWebhook(null)).toEqual([]);
    expect(parseChatProWebhook({ event: apiEvent() })).toEqual([]);
    expect(parseChatProWebhook(wrap({ Type: "send_message" }))).toEqual([]);
    expect(parseChatProWebhook(wrap("x"))).toEqual([]);
  });
});

describe("contactFromJid", () => {
  it("adds the Brazilian 9th digit to the normalized phone and keeps the original id", () => {
    expect(contactFromJid("554899990000@s.whatsapp.net", null)).toEqual({
      externalId: "554899990000",
      phoneNormalized: "5548999990000",
      profileName: null,
    });
  });

  it("handles device suffixes and privacy ids", () => {
    expect(contactFromJid("5511999999999:12@s.whatsapp.net", null)?.externalId).toBe("5511999999999");
    expect(contactFromJid("123456789012345678@s.whatsapp.net", null)).toEqual({
      externalId: "123456789012345678",
      phoneNormalized: null,
      profileName: null,
    });
    expect(contactFromJid("123456@lid", null)).toEqual({ externalId: "123456", phoneNormalized: null, profileName: null });
  });
});

describe("parseChatProHistory", () => {
  const row = (over: Record<string, unknown>) => ({
    id: "M1",
    from_me: false,
    number: "5548999990000@s.whatsapp.net",
    message: "Oi",
    ts_receive: "2026-11-06T18:17:00.000Z",
    type: "receveid_message",
    url: "",
    file_type: null,
    ...over,
  });

  it("marks messages as history in both directions, with the lead's name", () => {
    const [inbound, outbound] = parseChatProHistory(
      [row({}), row({ id: "M2", from_me: true, type: "send_message" })],
      "inst",
      "Ana",
    );
    expect(inbound).toMatchObject({ origin: "history", direction: "inbound", type: "text", body: "Oi" });
    expect(inbound?.contact.profileName).toBe("Ana");
    expect(outbound).toMatchObject({ origin: "history", direction: "outbound" });
  });

  it("reads the media kind from the type even without a mime type", () => {
    const events = parseChatProHistory(
      [
        row({ id: "A", type: "receveid_audio_message_preview", url: "https://files.example/a", message: "" }),
        row({ id: "V", type: "video_preview", url: "https://files.example/v", file_type: "video/mp4" }),
        row({ id: "I", type: "send_image_message", url: "https://files.example/i", message: "" }),
        row({ id: "C", type: "receveid_vcard", url: "", message: "" }),
      ],
      "inst",
      null,
    );
    expect(events.map((e) => e.type)).toEqual(["audio", "video", "image", "contacts"]);
    expect(events[0]?.mediaExternalId).toBe("https://files.example/a");
    expect(events[3]?.mediaExternalId).toBeNull();
  });

  it("skips session rows, deleted, ignored, empty and group messages", () => {
    expect(
      parseChatProHistory(
        [
          row({ type: "create_session" }),
          row({ type: "transfer_session" }),
          row({ delete_message: true }),
          row({ deleted_at: "2026-11-06T18:18:00.000Z" }),
          row({ ignore: true }),
          row({ message: "" }),
          row({ number: "120363@g.us" }),
          "not an object",
        ],
        "inst",
        null,
      ),
    ).toEqual([]);
  });
});
