import { describe, expect, it } from "vitest";
import { daysWithSlots, freeSlots, type Availability } from "./slots";

// Friday 2026-11-06, 10:00 in Brasília.
const NOW = new Date("2026-11-06T13:00:00Z");
const open = { open: "09:00", close: "12:00" };
const businessHours = { "5": open, "6": open };
const at = (day: string, time: string) => new Date(`${day}T${time}:00-03:00`).toISOString();
const base: Availability = { businessHours, staff: [{ id: "ana", workHours: null }], booked: [], now: NOW };
const times = (day: string, minutes: number, availability = base) => freeSlots(day, minutes, availability).map((s) => s.time);

describe("freeSlots", () => {
  it("offers every half hour that fits before closing", () => {
    expect(times("2026-11-07", 60)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
    expect(times("2026-11-07", 180)).toEqual(["09:00"]);
    expect(times("2026-11-07", 240)).toEqual([]);
  });

  it("gives an hour's notice today and nothing on past or closed days", () => {
    expect(times("2026-11-06", 30)).toEqual(["11:00", "11:30"]);
    expect(times("2026-11-05", 30)).toEqual([]);
    expect(times("2026-11-08", 30)).toEqual([]);
  });

  it("skips times that overlap what is booked for that person", () => {
    const booked = [{ staffId: "ana", startsAt: at("2026-11-07", "09:30"), endsAt: at("2026-11-07", "10:30") }];
    expect(times("2026-11-07", 60, { ...base, booked })).toEqual(["10:30", "11:00"]);
  });

  it("uses another person when one is busy, and the least busy first", () => {
    const staff = [{ id: "ana", workHours: null }, { id: "bia", workHours: null }];
    const booked = [{ staffId: "ana", startsAt: at("2026-11-07", "09:00"), endsAt: at("2026-11-07", "10:00") }];
    const slots = freeSlots("2026-11-07", 60, { ...base, staff, booked });
    expect(slots[0]).toEqual({ time: "09:00", staffId: "bia" });
    expect(slots.find((s) => s.time === "10:00")?.staffId).toBe("bia");
  });

  it("follows each person's work hours inside the opening hours", () => {
    const staff = [{ id: "ana", workHours: { "6": { open: "10:00", close: "11:00" } } }];
    expect(times("2026-11-07", 30, { ...base, staff })).toEqual(["10:00", "10:30"]);
  });

  it("counts a booking with nobody assigned against the team", () => {
    const booked = [{ staffId: null, startsAt: at("2026-11-07", "09:00"), endsAt: at("2026-11-07", "12:00") }];
    expect(times("2026-11-07", 30, { ...base, booked })).toEqual([]);
    const staff = [{ id: "ana", workHours: null }, { id: "bia", workHours: null }];
    expect(times("2026-11-07", 30, { ...base, staff, booked })).toHaveLength(6);
  });

  it("has nothing without opening hours or people", () => {
    expect(times("2026-11-07", 30, { ...base, businessHours: {} })).toEqual([]);
    expect(times("2026-11-07", 30, { ...base, staff: [] })).toEqual([]);
  });
});

describe("daysWithSlots", () => {
  it("lists the next open days, today included while it still has room", () => {
    expect(daysWithSlots(30, base, { limit: 3 })).toEqual(["2026-11-06", "2026-11-07", "2026-11-13"]);
    expect(daysWithSlots(180, base, { limit: 2 })).toEqual(["2026-11-07", "2026-11-13"]);
  });
});
