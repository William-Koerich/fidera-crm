import { describe, expect, it } from "vitest";
import { findDateTimes } from "./date-parser";

// Friday, 2026-11-06, 10:00 in Brasília.
const FRIDAY_10AM = "2026-11-06T13:00:00Z";
const find = (text: string, at = FRIDAY_10AM) => findDateTimes(text, at).map((m) => ({ text: m.text, date: m.date, time: m.time }));

describe("findDateTimes", () => {
  it("joins a date and a time that belong together, in either order", () => {
    expect(find("Pode ser sábado às 9h?")).toEqual([{ text: "sábado às 9h", date: "2026-11-07", time: "09:00" }]);
    expect(find("às 14:30 de terça")).toEqual([{ text: "às 14:30 de terça", date: "2026-11-10", time: "14:30" }]);
    expect(find("amanhã, 15h30")).toEqual([{ text: "amanhã, 15h30", date: "2026-11-07", time: "15:30" }]);
    expect(find("segunda-feira de manhã às 8h")).toEqual([{ text: "segunda-feira de manhã às 8h", date: "2026-11-09", time: "08:00" }]);
    expect(find("dia 12/11 às 10h")).toEqual([{ text: "dia 12/11 às 10h", date: "2026-11-12", time: "10:00" }]);
  });

  it("understands the ways people write a day", () => {
    expect(find("hoje")[0]?.date).toBe("2026-11-06");
    expect(find("depois de amanhã")[0]?.date).toBe("2026-11-08");
    expect(find("dia 20")[0]?.date).toBe("2026-11-20");
    expect(find("20/11")[0]?.date).toBe("2026-11-20");
    expect(find("20/11/2026")[0]?.date).toBe("2026-11-20");
    expect(find("20/11/26")[0]?.date).toBe("2026-11-20");
    expect(find("15 de março")[0]?.date).toBe("2027-03-15");
    expect(find("na próxima quinta")[0]?.date).toBe("2026-11-12");
  });

  it("understands the ways people write a time", () => {
    for (const [text, time] of [
      ["às 9h", "09:00"],
      ["9h30", "09:30"],
      ["9:30", "09:30"],
      ["9 horas", "09:00"],
      ["10hs", "10:00"],
      ["às 3", "03:00"],
      ["às 3 da tarde", "15:00"],
      ["as 8 da noite", "20:00"],
      ["10h da manhã", "10:00"],
    ] as const) {
      expect(find(text)[0]?.time, text).toBe(time);
    }
  });

  it("keeps relative dates relative to when the message was sent", () => {
    expect(find("amanhã às 9h", "2026-10-01T13:00:00Z")[0]?.date).toBe("2026-10-02");
  });

  it("moves past dates forward", () => {
    expect(find("dia 2")[0]?.date).toBe("2026-12-02");
    expect(find("01/02")[0]?.date).toBe("2027-02-01");
    expect(find("dia 31", "2026-11-06T13:00:00Z")[0]?.date).toBe("2026-12-31");
  });

  it("treats today's weekday as today only if the time is still ahead", () => {
    expect(find("sexta às 15h")[0]?.date).toBe("2026-11-06");
    expect(find("sexta às 8h")[0]?.date).toBe("2026-11-13");
    expect(find("sexta")[0]?.date).toBe("2026-11-13");
  });

  it("suggests the next possible day for a time alone", () => {
    expect(find("às 15h")[0]).toMatchObject({ date: "2026-11-06", time: "15:00" });
    expect(find("às 8h")[0]).toMatchObject({ date: "2026-11-07", time: "08:00" });
  });

  it("finds each option in a message", () => {
    expect(find("Tenho sábado às 9h ou segunda às 14h").map((m) => m.text)).toEqual(["sábado às 9h", "segunda às 14h"]);
  });

  it("uses the Brasília date around midnight", () => {
    // 01:00 UTC on the 7th is still 22:00 on the 6th in Brasília.
    expect(find("amanhã", "2026-11-07T01:00:00Z")[0]?.date).toBe("2026-11-07");
  });

  it("leaves numbers that are not dates or times as plain text", () => {
    for (const text of [
      "Custa R$ 10,00",
      "Atendimento 24h",
      "Demora 2h",
      "Fica pronto em 3 horas",
      "São 100%",
      "Comprei as 5 unidades",
      "12/2026",
      "31/02",
      "48 99999-0000",
      "Foi a segunda vez",
      "tenho 9 anos",
      "25:00",
      "",
    ]) {
      expect(find(text), text).toEqual([]);
    }
  });

  it("reports positions that match the original text, with accents", () => {
    const text = "Olá! Pode às 9h?";
    const [match] = findDateTimes(text, FRIDAY_10AM);
    expect(text.slice(match!.start, match!.end)).toBe("às 9h");
  });
});
