import { describe, expect, it } from "vitest";
import { formatPhone, formatRemaining, formatShortDate, whatsAppLink } from "./format";

describe("formatRemaining", () => {
  it.each([
    [0, "encerrada"],
    [-5, "encerrada"],
    [30_000, "menos de 1min"],
    [12 * 60_000, "12min"],
    [3 * 3_600_000, "3h"],
    [3 * 3_600_000 + 20 * 60_000, "3h 20min"],
  ])("%d ms -> %s", (ms, text) => {
    expect(formatRemaining(ms)).toBe(text);
  });
});

describe("formatPhone", () => {
  it("formats Brazilian mobiles and landlines", () => {
    expect(formatPhone("5548999990000")).toBe("+55 (48) 99999-0000");
    expect(formatPhone("554833334444")).toBe("+55 (48) 3333-4444");
    expect(formatPhone("14155550100")).toBe("+14155550100");
    expect(formatPhone(null)).toBe("");
  });
});

describe("whatsAppLink", () => {
  it("encodes the prefilled text", () => {
    expect(whatsAppLink("5548999990000", "Oi, Ana! Bora marcar?")).toBe(
      "https://wa.me/5548999990000?text=Oi%2C+Ana%21+Bora+marcar%3F",
    );
  });
});

describe("formatShortDate", () => {
  it("shows time for today and date otherwise (São Paulo)", () => {
    const now = new Date("2026-11-05T15:00:00Z");
    expect(formatShortDate("2026-11-05T13:05:00Z", now)).toBe("10:05");
    expect(formatShortDate("2026-11-03T13:05:00Z", now)).toBe("03/11");
  });
});
