import { describe, expect, it } from "vitest";
import { cleanItemName, cleanLabelColor, isTeamItemKind, planImport } from "./team-items";

describe("team items", () => {
  it("only accepts known kinds", () => {
    expect(isTeamItemKind("labels")).toBe(true);
    expect(isTeamItemKind("organizations")).toBe(false);
  });

  it("cleans names within each limit", () => {
    expect(cleanItemName("labels", "  Cliente   VIP ")).toBe("Cliente VIP");
    expect(cleanItemName("labels", "   ")).toBeNull();
    expect(cleanItemName("labels", "a".repeat(41))).toBeNull();
    expect(cleanItemName("endings", "a".repeat(41))).toHaveLength(41);
  });

  it("accepts only full hexadecimal colors", () => {
    expect(cleanLabelColor("#6D28D9")).toBe("#6d28d9");
    expect(cleanLabelColor("red")).toBeNull();
    expect(cleanLabelColor("#fff")).toBeNull();
  });

  it("adds what is new and links what matches by name, ignoring case", () => {
    expect(
      planImport(
        [
          { id: "1", name: "Resolvido", external_id: null },
          { id: "2", name: "Agendado", external_id: "e2" },
        ],
        [
          { id: "e1", name: "resolvido" },
          { id: "e2", name: "Agendado" },
          { id: "e3", name: "Sem retorno " },
        ],
      ),
    ).toEqual({ add: [{ name: "Sem retorno", externalId: "e3" }], link: [{ id: "1", externalId: "e1" }] });
  });
});
