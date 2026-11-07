import { describe, expect, it } from "vitest";
import { MAX_VISITOR_MESSAGE, isValidVisitor, parseVisitorMessage, visitorToken } from "./visitor";

const SECRET = "s".repeat(64);
const KEY = "a".repeat(32);
const VISITOR = "123e4567-e89b-12d3-a456-426614174000";

describe("visitor token", () => {
  it("accepts only the token issued for that visitor on that chat", () => {
    const token = visitorToken(SECRET, KEY, VISITOR);
    expect(isValidVisitor(SECRET, KEY, VISITOR, token)).toBe(true);
    expect(isValidVisitor(SECRET, "b".repeat(32), VISITOR, token)).toBe(false);
    expect(isValidVisitor(SECRET, KEY, "123e4567-e89b-12d3-a456-426614174001", token)).toBe(false);
    expect(isValidVisitor("other", KEY, VISITOR, token)).toBe(false);
  });

  it("refuses malformed input without throwing", () => {
    expect(isValidVisitor(SECRET, KEY, "x", "y")).toBe(false);
    expect(isValidVisitor(SECRET, KEY, VISITOR, 123)).toBe(false);
    expect(isValidVisitor(SECRET, KEY, VISITOR, "")).toBe(false);
  });
});

describe("parseVisitorMessage", () => {
  it("cleans the text, name and phone", () => {
    expect(parseVisitorMessage({ text: "  Oi  ", name: " Ana   Souza ", phone: "(48) 99999-0000" })).toEqual({
      ok: true,
      text: "Oi",
      name: "Ana Souza",
      phone: "5548999990000",
    });
    expect(parseVisitorMessage({ text: "Oi" })).toEqual({ ok: true, text: "Oi", name: null, phone: null });
  });

  it("refuses empty, oversized and malformed messages", () => {
    expect(parseVisitorMessage({ text: "   " })).toEqual({ ok: false, error: "empty" });
    expect(parseVisitorMessage({ text: "x".repeat(MAX_VISITOR_MESSAGE + 1) })).toEqual({ ok: false, error: "too_long" });
    expect(parseVisitorMessage(null)).toEqual({ ok: false, error: "invalid_body" });
    expect(parseVisitorMessage({ text: 5 })).toEqual({ ok: false, error: "empty" });
  });
});
