import { describe, expect, it } from "vitest";
import {
  addDays,
  confirmationText,
  durationLabel,
  formatDay,
  isoToLocal,
  localDateTimeToIso,
  matchService,
  parseAppointmentForm,
  parseServiceForm,
  validDay,
  weekStart,
} from "./form";

describe("agenda time", () => {
  it("round-trips Brasília clock time", () => {
    expect(localDateTimeToIso("2026-11-06", "09:00")).toBe("2026-11-06T12:00:00.000Z");
    expect(isoToLocal("2026-11-06T12:00:00Z")).toEqual({ date: "2026-11-06", time: "09:00" });
    expect(isoToLocal("2026-11-07T01:00:00Z")).toEqual({ date: "2026-11-06", time: "22:00" });
  });

  it("does calendar arithmetic across months", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(weekStart("2026-11-06")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(validDay(2026, 2, 30)).toBeNull();
    expect(formatDay("2026-11-07")).toBe("Sábado, 07/11");
  });
});

describe("parseAppointmentForm", () => {
  const base = { clientName: " Ana ", date: "2026-11-07", time: "09:00", duration: "30", service: " Corte ", notes: "", staffId: "" };
  const parse = (over: Record<string, string> = {}) => parseAppointmentForm((n) => ({ ...base, ...over })[n] ?? null);

  it("computes the period from the duration", () => {
    expect(parse()).toEqual({
      ok: true,
      values: {
        clientName: "Ana",
        startsAt: "2026-11-07T12:00:00.000Z",
        endsAt: "2026-11-07T12:30:00.000Z",
        service: "Corte",
        notes: null,
        staffId: null,
      },
    });
  });

  it("refuses what could not be booked", () => {
    expect(parse({ clientName: " " })).toMatchObject({ ok: false });
    expect(parse({ date: "2026-02-30" })).toMatchObject({ ok: false });
    expect(parse({ time: "25:00" })).toMatchObject({ ok: false });
    expect(parse({ duration: "7" })).toMatchObject({ ok: false });
  });
});

describe("services", () => {
  const services = [{ id: "1", name: "Corte", durationMinutes: 30 }, { id: "2", name: "Escova progressiva", durationMinutes: 180 }];

  it("finds a listed service as it is typed", () => {
    expect(matchService(services, " corte ")?.durationMinutes).toBe(30);
    expect(matchService(services, "Cort")).toBeUndefined();
    expect(matchService(services, "")).toBeUndefined();
  });

  it("validates the form", () => {
    const form = (name: string, duration: string) => parseServiceForm((n) => ({ name, duration })[n] ?? null);
    expect(form("  Corte   e barba ", "45")).toEqual({ ok: true, name: "Corte e barba", durationMinutes: 45 });
    expect(form(" ", "45")).toMatchObject({ ok: false });
    expect(form("Corte", "7")).toMatchObject({ ok: false });
  });

  it("labels durations", () => {
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(120)).toBe("2 h");
    expect(durationLabel(90)).toBe("1 h 30 min");
  });
});

describe("confirmationText", () => {
  const saved = { clientName: "Ana Souza", date: "2026-11-07", time: "09:00", service: "Corte" };

  it("greets by first name and says when and what", () => {
    expect(confirmationText(saved, true)).toBe("Olá, Ana! Seu horário ficou marcado para sábado, 07/11, às 09:00 (Corte). Até lá!");
  });

  it("does not greet a phone number, and leaves out a missing service", () => {
    expect(confirmationText({ ...saved, clientName: "+55 (48) 99999-0000", service: null }, false)).toBe(
      "Olá! Seu horário ficou marcado para sábado, 07/11, às 09:00. Até lá!",
    );
  });
});
