import { describe, expect, it } from "vitest";
import { computeReplyWindow } from "./reply-window";

const HOUR = 3_600_000;
const last = new Date("2026-11-04T12:00:00Z");

describe("computeReplyWindow", () => {
  it("is closed when the contact never wrote", () => {
    expect(computeReplyWindow({ channel: "whatsapp", lastInboundAt: null }, last)).toEqual({
      isOpen: false,
      endsAt: null,
      remainingMs: 0,
      humanAgentEndsAt: null,
    });
  });

  it("is open for 24h after the last inbound message", () => {
    const w = computeReplyWindow({ channel: "whatsapp", lastInboundAt: last }, new Date(last.getTime() + 23 * HOUR));
    expect(w.isOpen).toBe(true);
    expect(w.remainingMs).toBe(HOUR);
    expect(w.endsAt?.toISOString()).toBe("2026-11-05T12:00:00.000Z");
  });

  it("closes exactly at 24h", () => {
    const w = computeReplyWindow({ channel: "whatsapp", lastInboundAt: last }, new Date(last.getTime() + 24 * HOUR));
    expect(w.isOpen).toBe(false);
    expect(w.remainingMs).toBe(0);
  });

  it("adds the 7-day Human Agent end for Instagram only when approved", () => {
    const ig = { channel: "instagram" as const, lastInboundAt: last };
    expect(computeReplyWindow(ig, last).humanAgentEndsAt).toBeNull();
    expect(computeReplyWindow(ig, last, { humanAgentApproved: true }).humanAgentEndsAt?.toISOString()).toBe(
      "2026-11-11T12:00:00.000Z",
    );
    expect(
      computeReplyWindow({ channel: "whatsapp", lastInboundAt: last }, last, { humanAgentApproved: true })
        .humanAgentEndsAt,
    ).toBeNull();
  });
});
