import { describe, expect, it } from "vitest";
import { estimateSendCost } from "./pricing";

describe("estimateSendCost", () => {
  it("service replies are free for the first 1000 per number per month", () => {
    expect(estimateSendCost("service", 0)).toBe(0);
    expect(estimateSendCost("service", 999)).toBe(0);
    expect(estimateSendCost("service", 1000)).toBe(0.035);
  });

  it("templates are always paid", () => {
    expect(estimateSendCost("utility", 0)).toBe(0.035);
    expect(estimateSendCost("marketing", 0)).toBe(0.3217);
  });
});
