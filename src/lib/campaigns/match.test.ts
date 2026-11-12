import { describe, expect, it } from "vitest";
import { findCampaign, matchScore, normalizeMessage } from "./match";

const unhas = { id: "unhas", triggerText: "Olá! Quero saber mais sobre o curso de unhas em gel" };
const cilios = { id: "cilios", triggerText: "Quero agendar extensão de cílios com desconto" };
const corte = { id: "corte", triggerText: "Promoção corte" };

describe("normalizeMessage", () => {
  it("drops capitals, accents, punctuation and emojis", () => {
    expect(normalizeMessage("  Olá!!  Quero o CURSO 😍 de Cílios...  ")).toBe("ola quero o curso de cilios");
  });
});

describe("matchScore", () => {
  it("matches the message as sent, or with words added around it", () => {
    expect(matchScore("Olá! Quero saber mais sobre o curso de unhas em gel", unhas.triggerText)).toBeGreaterThan(1);
    expect(matchScore("bom dia! ola quero saber mais sobre o curso de unhas em gel 💅 obrigada", unhas.triggerText)).toBeGreaterThan(1);
  });

  it("forgives a word or two lost along the way in longer messages", () => {
    expect(matchScore("Quero saber mais sobre o curso de unhas em gel", unhas.triggerText)).toBeGreaterThan(0);
  });

  it("never matches a greeting, part of the trigger, or an unrelated message", () => {
    expect(matchScore("Oi", unhas.triggerText)).toBe(0);
    expect(matchScore("curso de unhas", unhas.triggerText)).toBe(0);
    expect(matchScore("Quero agendar um corte para amanhã", cilios.triggerText)).toBe(0);
  });

  it("only accepts short triggers whole", () => {
    expect(matchScore("Vi a promoção corte no Instagram", corte.triggerText)).toBeGreaterThan(1);
    expect(matchScore("Tem promoção?", corte.triggerText)).toBe(0);
    expect(matchScore("promoções cortes", corte.triggerText)).toBe(0);
  });

  it("does not let a long message match by containing most words by chance", () => {
    const long = "ola quero saber mais sobre o horario e se tem curso de unhas em gel e tambem preço de escova progressiva amanha cedo por favor";
    expect(matchScore(long, unhas.triggerText)).toBe(0);
  });
});

describe("findCampaign", () => {
  it("picks the campaign the message belongs to, or none", () => {
    expect(findCampaign("Quero agendar extensão de cílios com desconto!", [unhas, cilios, corte])?.id).toBe("cilios");
    expect(findCampaign("Oi, tudo bem?", [unhas, cilios, corte])).toBeNull();
  });

  it("prefers the most specific when several match", () => {
    const geral = { id: "geral", triggerText: "Quero saber mais" };
    expect(findCampaign("Olá! Quero saber mais sobre o curso de unhas em gel", [geral, unhas])?.id).toBe("unhas");
  });
});
