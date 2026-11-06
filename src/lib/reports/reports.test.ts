import { describe, expect, it } from "vitest";
import { guardCell, guardCsvText, toCsv } from "./csv";
import { chartBuckets, formatDuration, localDate, monthlyPace, parseDay, parsePreset, periodFor } from "./period";

describe("periods", () => {
  it("uses the date in Brasília, not UTC", () => {
    expect(localDate(new Date("2026-11-07T01:00:00Z"))).toBe("2026-11-06");
    expect(localDate(new Date("2026-11-07T03:00:00Z"))).toBe("2026-11-07");
  });

  it("counts today within the period and crosses months", () => {
    expect(periodFor(7, new Date("2026-11-03T15:00:00Z"))).toEqual({ from: "2026-10-28", to: "2026-11-03" });
    expect(periodFor(1, new Date("2026-11-03T15:00:00Z"))).toEqual({ from: "2026-11-03", to: "2026-11-03" });
  });

  it("falls back to the default for anything unknown", () => {
    expect(parsePreset("7")).toBe(7);
    expect(parsePreset("999")).toBe(30);
    expect(parsePreset(undefined)).toBe(30);
    expect(parsePreset(["7", "30"])).toBe(30);
  });

  it("accepts only real days", () => {
    expect(parseDay("2026-11-06")).toBe("2026-11-06");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("06/11/2026")).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });

  it("projects a month from the pace of the period", () => {
    expect(monthlyPace(70, 7)).toBe(300);
    expect(monthlyPace(0, 30)).toBe(0);
  });

  it("writes durations people can read", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(720)).toBe("12 min");
    expect(formatDuration(7200)).toBe("2 h");
    expect(formatDuration(12000)).toBe("3 h 20 min");
    expect(formatDuration(187200)).toBe("2 d 4 h");
  });
});

describe("chartBuckets", () => {
  const period = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ day: new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10), attendances: 1 }));

  it("keeps one bar per day in short periods", () => {
    const { unit, buckets } = chartBuckets(period(30));
    expect(unit).toBe("dia");
    expect(buckets).toHaveLength(30);
    expect(buckets[0]).toEqual({ label: "01/08", attendances: 1 });
  });

  it("groups long periods by week, without losing the last days", () => {
    const { unit, buckets } = chartBuckets(period(90));
    expect(unit).toBe("semana");
    expect(buckets).toHaveLength(13);
    expect(buckets[0]).toEqual({ label: "01/08 a 07/08", attendances: 7 });
    expect(buckets.at(-1)?.attendances).toBe(6);
    expect(buckets.reduce((sum, b) => sum + b.attendances, 0)).toBe(90);
  });
});

describe("csv", () => {
  it("opens in Excel with accents and separators intact", () => {
    const csv = toCsv(["Nome", "Recebidas"], [["João; \"Jota\"", 3], [null, 0]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"João; ""Jota""";3');
    expect(csv).toContain(";0\r\n");
  });

  it("keeps a name from running as a formula", () => {
    expect(guardCell('=HYPERLINK("http://mal")')).toBe('\'=HYPERLINK("http://mal")');
    expect(guardCell("@soma")).toBe("'@soma");
    expect(guardCell("+55 11")).toBe("'+55 11");
    expect(guardCell("-1+1")).toBe("'-1+1");
    expect(guardCell("Ana")).toBe("Ana");
    expect(guardCell("-12,5")).toBe("-12,5");
  });

  it("protects a file made elsewhere, cell by cell", () => {
    expect(guardCsvText("﻿id;nome\n1;=cmd()\n")).toBe("﻿id;nome\r\n1;'=cmd()\r\n");
  });
});
