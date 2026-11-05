import { describe, expect, it } from "vitest";
import { afterCursorFilter, decodeCursor, encodeCursor } from "./cursor";

const cursor = { at: "2026-11-04T12:00:00.000Z", id: "6b1f0c2e-1d2a-4f5b-9c8d-0e1f2a3b4c5d" };

describe("cursor", () => {
  it("round-trips", () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects tampered or malformed values", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("not-base64-json")).toBeNull();
    expect(decodeCursor(Buffer.from('["x","y"]').toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from(`["${cursor.at}","1),or(id.gt.0"]`).toString("base64url"))).toBeNull();
  });

  it("builds a keyset filter", () => {
    expect(afterCursorFilter("last_message_at", cursor)).toBe(
      `last_message_at.lt.${cursor.at},and(last_message_at.eq.${cursor.at},id.lt.${cursor.id})`,
    );
  });
});
