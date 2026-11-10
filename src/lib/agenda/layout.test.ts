import { describe, expect, it } from "vitest";
import { hourRange, layoutDay, openWindow, toClock, toMinutes } from "./layout";

const range = (r: { start: number; end: number }) => r;
const lanes = (items: { start: number; end: number }[]) => layoutDay(items, range).map((p) => [p.start, p.lane, p.lanes]);

describe("layoutDay", () => {
  it("gives the whole width to appointments that do not overlap", () => {
    expect(lanes([{ start: 600, end: 660 }, { start: 660, end: 720 }])).toEqual([
      [600, 0, 1],
      [660, 0, 1],
    ]);
  });

  it("puts overlapping appointments side by side, reusing a lane once it is free", () => {
    expect(
      lanes([
        { start: 540, end: 660 },
        { start: 570, end: 600 },
        { start: 600, end: 630 },
        { start: 720, end: 750 },
      ]),
    ).toEqual([
      [540, 0, 2],
      [570, 1, 2],
      [600, 1, 2],
      [720, 0, 1],
    ]);
  });

  it("counts three at the same time as three lanes", () => {
    expect(lanes([{ start: 600, end: 660 }, { start: 600, end: 630 }, { start: 610, end: 640 }]).map((l) => l[2])).toEqual([3, 3, 3]);
  });
});

describe("hourRange", () => {
  it("covers the opening hours and stretches for appointments outside them", () => {
    const hours = { "6": { open: "07:30", close: "21:00" } };
    expect(hourRange(["2026-11-07"], hours, [])).toEqual({ from: 7, to: 21 });
    expect(hourRange(["2026-11-09"], {}, [{ date: "2026-11-09", start: 22 * 60, end: 23 * 60 + 30 }])).toEqual({ from: 8, to: 24 });
    expect(hourRange(["2026-11-09"], {}, [{ date: "2026-11-10", start: 5 * 60, end: 6 * 60 }])).toEqual({ from: 8, to: 20 });
  });
});

describe("helpers", () => {
  it("converts clock times", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(toClock(570)).toBe("09:30");
    expect(toClock(24 * 60 + 15)).toBe("00:15");
  });

  it("knows when a day is open", () => {
    expect(openWindow("2026-11-07", { "6": { open: "09:00", close: "17:00" } })).toEqual({ start: 540, end: 1020 });
    expect(openWindow("2026-11-08", { "6": { open: "09:00", close: "17:00" } })).toBeNull();
  });
});
