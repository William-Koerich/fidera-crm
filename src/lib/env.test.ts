import { describe, expect, it } from "vitest";
import { getWhatsAppProviderName } from "./env";

describe("getWhatsAppProviderName", () => {
  it("defaults to mock", () => {
    expect(getWhatsAppProviderName({})).toBe("mock");
  });

  it("accepts meta, case-insensitive", () => {
    expect(getWhatsAppProviderName({ WHATSAPP_PROVIDER: " META " })).toBe("meta");
  });

  it("rejects unknown providers", () => {
    expect(() => getWhatsAppProviderName({ WHATSAPP_PROVIDER: "baileys" })).toThrow(
      /Invalid WHATSAPP_PROVIDER/,
    );
  });
});
