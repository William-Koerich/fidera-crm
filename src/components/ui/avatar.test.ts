import { describe, expect, it } from "vitest";
import { initials } from "./avatar";

describe("initials", () => {
  it.each([
    ["Ana Souza", null, "AS"],
    ["ana", null, "A"],
    ["José da Silva Júnior", null, "JJ"],
    ["  ", "5548999990000", "00"],
    [null, null, "?"],
    ["🙂 Bia", null, "B"],
  ])("%s -> %s", (name, phone, expected) => {
    expect(initials(name, phone)).toBe(expected);
  });
});
