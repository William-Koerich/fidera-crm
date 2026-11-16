import { describe, expect, it } from "vitest";
import { salesWhatsAppUrl, TRIAL_MESSAGE } from "./sales";

describe("salesWhatsAppUrl", () => {
  it("builds a wa.me link with the message", () => {
    expect(salesWhatsAppUrl("Oi", { NEXT_PUBLIC_SALES_WHATSAPP: "+55 (48) 99999-0000" })).toBe("https://wa.me/5548999990000?text=Oi");
  });

  it("uses the trial message by default", () => {
    const url = salesWhatsAppUrl(undefined, { NEXT_PUBLIC_SALES_WHATSAPP: "5548999990000" });
    expect(url).toBe(`https://wa.me/5548999990000?text=${encodeURIComponent(TRIAL_MESSAGE)}`);
  });

  it("returns null without a usable number", () => {
    expect(salesWhatsAppUrl("Oi", {})).toBeNull();
    expect(salesWhatsAppUrl("Oi", { NEXT_PUBLIC_SALES_WHATSAPP: "1234" })).toBeNull();
  });
});
