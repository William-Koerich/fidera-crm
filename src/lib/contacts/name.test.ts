import { describe, expect, it } from "vitest";
import { chooseContactName } from "./name";

const profile = (savedName: string | null, publicName: string | null) => ({ savedName, publicName, imageUrl: null });

describe("chooseContactName", () => {
  it("prefers the name saved on the phone, even over an existing one", () => {
    expect(chooseContactName("Aninha", profile("Ana Souza", "Ana ✨"))).toBe("Ana Souza");
  });

  it("uses the person's own name only to fill a blank", () => {
    expect(chooseContactName(null, profile(null, "Ana ✨"))).toBe("Ana ✨");
    expect(chooseContactName("Ana Souza", profile(null, "Ana ✨"))).toBe("Ana Souza");
    expect(chooseContactName(null, profile(null, null))).toBeNull();
  });
});
