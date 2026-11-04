import { describe, expect, it } from "vitest";
import { signBody, verifySignature } from "./signature";

const secret = "test-secret";
const body = '{"object":"whatsapp_business_account","entry":[]}';

describe("webhook signature", () => {
  it("accepts a valid signature over the raw body", () => {
    expect(verifySignature(body, signBody(body, secret), secret)).toBe(true);
  });

  it("rejects a re-serialized body, wrong secret, or missing header", () => {
    const reserialized = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifySignature(reserialized, signBody(body, secret), secret)).toBe(false);
    expect(verifySignature(body, signBody(body, "other"), secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
    expect(verifySignature(body, "sha256=abc", secret)).toBe(false);
  });
});
