import { describe, expect, it } from "vitest";
import { canAskAgain, npsScore, parseNpsForm } from "./nps";

describe("npsScore", () => {
  it("subtracts detractors from promoters as a percentage", () => {
    expect(npsScore({ promoters: 6, detractors: 2, answered: 10 })).toBe(40);
    expect(npsScore({ promoters: 0, detractors: 5, answered: 5 })).toBe(-100);
    expect(npsScore({ promoters: 1, detractors: 0, answered: 3 })).toBe(33);
  });

  it("has no score without answers, which is different from zero", () => {
    expect(npsScore({ promoters: 0, detractors: 0, answered: 0 })).toBeNull();
    expect(npsScore({ promoters: 1, detractors: 1, answered: 2 })).toBe(0);
  });
});

describe("canAskAgain", () => {
  const now = new Date("2026-11-06T12:00:00Z");

  it("waits 30 days between surveys for the same person", () => {
    expect(canAskAgain(null, now)).toBe(true);
    expect(canAskAgain("2026-10-20T12:00:00Z", now)).toBe(false);
    expect(canAskAgain("2026-10-07T12:00:00Z", now)).toBe(true);
  });
});

describe("parseNpsForm", () => {
  const form = (values: Record<string, string>) => parseNpsForm((name) => values[name] ?? null);

  it("requires both texts to turn it on", () => {
    expect(form({ enabled: "on", question: "De 0 a 10?" })).toMatchObject({ ok: false });
    expect(form({ enabled: "on", thanks: "Obrigado" })).toMatchObject({ ok: false });
    expect(form({ enabled: "on", question: " De 0 a 10? ", thanks: "Obrigado" })).toEqual({
      ok: true,
      enabled: true,
      question: "De 0 a 10?",
      thanks: "Obrigado",
    });
  });

  it("allows saving it off, even empty", () => {
    expect(form({})).toMatchObject({ ok: true, enabled: false });
  });
});
