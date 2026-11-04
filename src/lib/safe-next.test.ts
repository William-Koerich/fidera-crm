import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/invite/abc?x=1")).toBe("/invite/abc?x=1");
  });

  it.each([null, "", "https://evil.com", "//evil.com", "/\\evil.com", "/ok\n//evil", "javascript:alert(1)"])(
    "rejects %s",
    (v) => {
      expect(safeNextPath(v)).toBe("/inbox");
    },
  );
});
