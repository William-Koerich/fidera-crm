import { describe, expect, it } from "vitest";
import {
  FIXTURE_PHONE_NUMBER_ID,
  contactStateSync,
  historyChunk,
  inboundImage,
  inboundText,
  messageEcho,
  partnerRemoved,
  statusUpdate,
} from "./fixtures";
import { parseWhatsAppWebhook } from "./parse";

const at = new Date("2026-11-04T15:00:00Z");

describe("parseWhatsAppWebhook", () => {
  it("parses an inbound text with the contact profile and normalized phone", () => {
    const [ev] = parseWhatsAppWebhook(
      inboundText({ from: "554899990000", name: "Ana", body: "Tem horário amanhã?", id: "wamid.1", at }),
    );
    expect(ev).toEqual({
      kind: "message",
      channel: "whatsapp",
      accountExternalId: FIXTURE_PHONE_NUMBER_ID,
      direction: "inbound",
      origin: "customer",
      contact: { externalId: "554899990000", phoneNormalized: "5548999990000", profileName: "Ana" },
      externalMessageId: "wamid.1",
      type: "text",
      body: "Tem horário amanhã?",
      mediaExternalId: null,
      mediaMimeType: null,
      occurredAt: at,
    });
  });

  it("parses media with id, mime type and caption", () => {
    const [ev] = parseWhatsAppWebhook(
      inboundImage({ from: "5548999990000", id: "wamid.2", mediaId: "media-1", caption: "Esse corte" }),
    );
    expect(ev).toMatchObject({ type: "image", body: "Esse corte", mediaExternalId: "media-1", mediaMimeType: "image/jpeg" });
  });

  it("parses delivery statuses including errors", () => {
    expect(parseWhatsAppWebhook(statusUpdate({ id: "wamid.3", to: "5548999990000", status: "read", at }))).toEqual([
      {
        kind: "status",
        channel: "whatsapp",
        accountExternalId: FIXTURE_PHONE_NUMBER_ID,
        externalMessageId: "wamid.3",
        status: "read",
        occurredAt: at,
        errorCode: null,
      },
    ]);
    const [failed] = parseWhatsAppWebhook(
      statusUpdate({ id: "wamid.4", to: "5548999990000", status: "failed", errorCode: 131047 }),
    );
    expect(failed).toMatchObject({ status: "failed", errorCode: "131047" });
  });

  it("parses smb_message_echoes as outbound messages from the business app", () => {
    const [ev] = parseWhatsAppWebhook(messageEcho({ to: "554899990000", body: "Te espero às 15h", id: "wamid.5" }));
    expect(ev).toMatchObject({
      kind: "message",
      direction: "outbound",
      origin: "business_app_echo",
      contact: { externalId: "554899990000", phoneNormalized: "5548999990000" },
      body: "Te espero às 15h",
    });
  });

  it("parses history chunks into progress + messages in both directions", () => {
    const events = parseWhatsAppWebhook(
      historyChunk({
        phase: 1,
        chunkOrder: 3,
        progress: 40,
        threads: [
          {
            userId: "5548988887777",
            messages: [
              { id: "h.1", fromBusiness: false, body: "Oi", at },
              { id: "h.2", fromBusiness: true, body: "Olá!", at },
            ],
          },
        ],
      }),
    );
    expect(events[0]).toEqual({
      kind: "history_progress",
      channel: "whatsapp",
      accountExternalId: FIXTURE_PHONE_NUMBER_ID,
      phase: 1,
      chunkOrder: 3,
      progress: 40,
    });
    expect(events.slice(1).map((e) => e.kind === "message" && [e.direction, e.origin, e.contact.externalId])).toEqual([
      ["inbound", "history", "5548988887777"],
      ["outbound", "history", "5548988887777"],
    ]);
  });

  it("parses smb_app_state_sync contact add and remove", () => {
    const [add] = parseWhatsAppWebhook(contactStateSync({ phone: "554899990000", action: "add", fullName: "Ana Souza" }));
    expect(add).toMatchObject({
      kind: "contact_sync",
      action: "add",
      contact: { phoneNormalized: "5548999990000", profileName: "Ana Souza" },
    });
    const [remove] = parseWhatsAppWebhook(contactStateSync({ phone: "554899990000", action: "remove" }));
    expect(remove).toMatchObject({ action: "remove", contact: { profileName: null } });
  });

  it("parses account_update PARTNER_REMOVED", () => {
    expect(parseWhatsAppWebhook(partnerRemoved({ reason: "PRIMARY_INACTIVITY", initiatedBy: "SYSTEM" }))).toEqual([
      {
        kind: "account_update",
        channel: "whatsapp",
        businessExternalId: "100000000000001",
        event: "PARTNER_REMOVED",
        reason: "PRIMARY_INACTIVITY",
        initiatedBy: "SYSTEM",
      },
    ]);
  });

  it("is defensive with unknown or malformed payloads", () => {
    expect(parseWhatsAppWebhook(null)).toEqual([]);
    expect(parseWhatsAppWebhook({ object: "page" })).toEqual([]);
    expect(parseWhatsAppWebhook({ object: "whatsapp_business_account", entry: "x" })).toEqual([]);
    expect(
      parseWhatsAppWebhook({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ field: "message_template_status_update", value: {} }] }],
      }),
    ).toEqual([{ kind: "unsupported", channel: "whatsapp", field: "message_template_status_update" }]);
    // Message without id/timestamp is dropped, not thrown.
    expect(
      parseWhatsAppWebhook({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ field: "messages", value: { messages: [{ from: "1", type: "text" }] } }] }],
      }),
    ).toEqual([]);
  });

  it("maps unknown message types to unsupported", () => {
    const payload = inboundText({ from: "5548999990000", body: "x", id: "wamid.9" });
    const value = payload.entry[0]!.changes[0]!.value as unknown as { messages: Record<string, unknown>[] };
    value.messages[0]!.type = "order";
    expect(parseWhatsAppWebhook(payload)[0]).toMatchObject({ type: "unsupported", body: null });
  });
});
