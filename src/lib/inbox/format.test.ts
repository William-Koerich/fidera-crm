import { describe, expect, it } from "vitest";
import { formatDayLabel, formatPhone, formatRemaining, formatShortDate, whatsAppLink } from "./format";

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
  const now = new Date("2026-11-05T15:00:00Z"); // Thursday, 12:00 in São Paulo

  it("shows time today, Ontem, weekday within a week, then dd/mm", () => {
    expect(formatShortDate("2026-11-05T13:05:00Z", now)).toBe("10:05");
    expect(formatShortDate("2026-11-04T13:05:00Z", now)).toBe("Ontem");
    expect(formatShortDate("2026-11-02T13:05:00Z", now)).toBe("Segunda");
    expect(formatShortDate("2026-10-20T13:05:00Z", now)).toBe("20/10");
  });

  it("uses the São Paulo calendar day, not UTC", () => {
    // 01:30 UTC on Nov 5 is still Nov 4 (22:30) in São Paulo.
    expect(formatShortDate("2026-11-05T01:30:00Z", now)).toBe("Ontem");
  });
});

describe("formatDayLabel", () => {
  const now = new Date("2026-11-05T15:00:00Z");
  it.each([
    ["2026-11-05T12:00:00Z", "Hoje"],
    ["2026-11-04T12:00:00Z", "Ontem"],
    ["2026-11-01T12:00:00Z", "1 de novembro"],
    ["2025-12-24T12:00:00Z", "24 de dezembro de 2025"],
  ])("%s -> %s", (iso, label) => {
    expect(formatDayLabel(iso, now)).toBe(label);
  });
});
