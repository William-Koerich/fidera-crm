import { describe, expect, it } from "vitest";
import { filterQuickReplies, normalizeShortcut, slashQuery } from "./quick-replies";

describe("normalizeShortcut", () => {
  it("accepts what people naturally type", () => {
    expect(normalizeShortcut("/Horário de Sábado")).toBe("horario-de-sabado");
    expect(normalizeShortcut("  preco_corte ")).toBe("preco-corte");
  });

  it("refuses what cannot be typed after the slash", () => {
    expect(normalizeShortcut("/")).toBeNull();
    expect(normalizeShortcut("olá!")).toBeNull();
    expect(normalizeShortcut("a".repeat(31))).toBeNull();
  });
});

describe("slashQuery", () => {
  it("only opens while the text is a single slash word", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/Hor")).toBe("hor");
    expect(slashQuery("/hor ario")).toBeNull();
    expect(slashQuery("/hor\n")).toBeNull();
    expect(slashQuery("oi /hor")).toBeNull();
    expect(slashQuery("")).toBeNull();
  });
});

describe("filterQuickReplies", () => {
  const replies = [
    { id: "1", shortcut: "preco-corte", body: "a" },
    { id: "2", shortcut: "corte", body: "b" },
    { id: "3", shortcut: "endereco", body: "c" },
  ];

  it("ranks prefix matches first and keeps everything for an empty query", () => {
    expect(filterQuickReplies(replies, "corte").map((r) => r.id)).toEqual(["2", "1"]);
    expect(filterQuickReplies(replies, "")).toHaveLength(3);
    expect(filterQuickReplies(replies, "zzz")).toEqual([]);
  });
});
