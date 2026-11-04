import { describe, expect, it } from "vitest";
import { MockChannelProvider } from "./mock-provider";
import { inboundText } from "./whatsapp/fixtures";

const input = {
  channel: "whatsapp" as const,
  accountExternalId: "200000000000001",
  to: "5548999990000",
  type: "text" as const,
  body: "Olá!",
};

describe("MockChannelProvider", () => {
  it("parses Cloud API shaped webhooks", () => {
    const provider = new MockChannelProvider();
    const events = provider.parseWebhook(inboundText({ from: "5548999990000", body: "Oi", id: "wamid.1" }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "message", externalMessageId: "wamid.1" });
  });

  it("records sent messages with unique external ids", async () => {
    const now = new Date("2026-11-04T10:00:00Z");
    const provider = new MockChannelProvider({ now: () => now });
    const a = await provider.sendMessage(input);
    const b = await provider.sendMessage(input);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.externalMessageId).toMatch(/^mock\./);
      expect(a.externalMessageId).not.toBe(b.externalMessageId);
      expect(a.acceptedAt).toEqual(now);
    }
    expect(provider.sent).toHaveLength(2);
  });

  it("can simulate a failure once", async () => {
    const provider = new MockChannelProvider();
    provider.failNextSend("131047", "Outside window", false);
    expect(await provider.sendMessage(input)).toEqual({
      ok: false,
      errorCode: "131047",
      errorMessage: "Outside window",
      retryable: false,
    });
    expect((await provider.sendMessage(input)).ok).toBe(true);
  });

  it("rejects empty messages", async () => {
    const result = await new MockChannelProvider().sendMessage({ ...input, body: "  " });
    expect(result).toMatchObject({ ok: false, errorCode: "empty_body" });
  });

  it("computes the reply window with its clock", () => {
    const now = new Date("2026-11-04T10:00:00Z");
    const provider = new MockChannelProvider({ now: () => now });
    const w = provider.getReplyWindow({ channel: "whatsapp", lastInboundAt: new Date("2026-11-04T09:00:00Z") });
    expect(w.isOpen).toBe(true);
    expect(w.remainingMs).toBe(23 * 3_600_000);
  });
});
