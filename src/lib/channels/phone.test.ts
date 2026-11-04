import { describe, expect, it } from "vitest";
import { isBrazilianMobile, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["5548999990000", "5548999990000"], // already canonical
    ["554899990000", "5548999990000"], // WhatsApp wa_id without the 9th digit
    ["+55 (48) 99999-0000", "5548999990000"],
    ["48 99999-0000", "5548999990000"], // no country code
    ["4899990000", "5548999990000"], // no country code, no 9th digit
    ["554833334444", "554833334444"], // landline keeps 8 digits
    ["(11) 3333-4444", "551133334444"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("keeps foreign numbers as digits", () => {
    expect(normalizePhone("+1 415 555 0100")).toBe("14155550100");
    expect(normalizePhone("+351 912 345 678")).toBe("351912345678");
  });

  it("returns null for empty or too short input", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("1234")).toBeNull();
  });

  it("detects Brazilian mobiles", () => {
    expect(isBrazilianMobile("5548999990000")).toBe(true);
    expect(isBrazilianMobile("554833334444")).toBe(false);
  });
});
