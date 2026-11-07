import { describe, expect, it } from "vitest";
import { parseBotForm, type BotSettings } from "./config";
import { bookedText, pick, retryAfterConflict, startBot, stepBot, type BotContext, type BotState } from "./engine";

const settings: BotSettings = {
  enabled: true,
  welcome: "Olá! Como posso ajudar?",
  handoffText: "Já vou chamar alguém da equipe.",
  options: [
    { label: "Agendar horário", action: "book", reply: null, departmentId: null },
    { label: "Endereço", action: "reply", reply: "Rua das Flores, 100.", departmentId: null },
    { label: "Falar com a equipe", action: "handoff", reply: null, departmentId: "dep-1" },
  ],
};
const context = (over: Partial<BotContext> = {}): BotContext => ({
  settings,
  services: [{ id: "corte", name: "Corte", durationMinutes: 30 }, { id: "escova", name: "Escova", durationMinutes: 60 }],
  days: () => ["2026-11-07", "2026-11-09"],
  times: () => [{ time: "09:00", staffId: "ana" }, { time: "10:00", staffId: "bia" }],
  ...over,
});

function run(texts: string[], ctx = context()) {
  let turn = startBot(ctx);
  const replies = [...turn.replies];
  for (const text of texts) {
    turn = stepBot(turn.state, text, ctx);
    replies.push(...turn.replies);
  }
  return { turn, replies };
}

describe("bot", () => {
  it("greets with the numbered menu", () => {
    expect(startBot(context()).replies[0]).toBe(
      "Olá! Como posso ajudar?\n\n1 - Agendar horário\n2 - Endereço\n3 - Falar com a equipe\n\nResponda com o número da opção.",
    );
  });

  it("books through service, day, time and confirmation", () => {
    const { turn, replies } = run(["1", "2", "1", "2", "1"]);
    expect(replies[1]).toContain("1 - Corte (30 min)\n2 - Escova (1 h)");
    expect(replies[2]).toContain("1 - Sábado, 07/11\n2 - Segunda, 09/11");
    expect(replies[3]).toContain("Horários livres em sábado, 07/11:\n1 - 09:00\n2 - 10:00");
    expect(replies[4]).toBe("Confirma escova em sábado, 07/11, às 10:00?\n1 - Sim, confirmar\n2 - Escolher outro horário");
    expect(turn.book).toEqual({ serviceId: "escova", serviceName: "Escova", durationMinutes: 60, day: "2026-11-07", time: "10:00", staffId: "bia" });
    expect(turn.state.step).toBe("ended");
    expect(bookedText(turn.book!)).toBe("Pronto! Seu horário de escova ficou marcado para sábado, 07/11, às 10:00. Até lá!");
  });

  it("goes back to the times when the person wants another one", () => {
    const { turn } = run(["1", "1", "1", "1", "não"]);
    expect(turn.state.step).toBe("time");
    expect(turn.book).toBeUndefined();
  });

  it("answers a text option and stays on the menu", () => {
    const { turn, replies } = run(["endereço"]);
    expect(replies[1]).toBe("Rua das Flores, 100.\n\nDigite 0 para voltar ao menu.");
    expect(turn.state.step).toBe("menu");
  });

  it("hands over to the team, with the option's department", () => {
    const { turn, replies } = run(["3"]);
    expect(replies[1]).toBe("Já vou chamar alguém da equipe.");
    expect(turn.handoff).toEqual({ departmentId: "dep-1" });
    expect(turn.state.step).toBe("ended");
  });

  it("hands over after two answers it cannot understand, never trapping the person", () => {
    const { turn, replies } = run(["quero cortar", "amanhã cedo"]);
    expect(replies[1]).toBe("Não entendi. Responda só com o número de uma das opções.");
    expect(replies[2]).toBe("Não consegui entender. Já vou chamar alguém da equipe.");
    expect(turn.handoff).toEqual({ departmentId: null });
  });

  it("lets the person ask for a human or the menu at any step", () => {
    expect(run(["1", "atendente"]).turn.handoff).toBeDefined();
    expect(run(["1", "1", "0"]).turn.state.step).toBe("menu");
  });

  it("hands over when there is nothing free or no service to book", () => {
    expect(run(["1", "1"], context({ days: () => [] })).replies[2]).toBe(
      "Não encontrei horários livres para corte nos próximos dias. Já vou chamar alguém da equipe.",
    );
    expect(run(["1"], context({ services: [] })).turn.handoff).toBeDefined();
  });

  it("offers the day's other times after losing one to someone faster", () => {
    const booking = { serviceId: "corte", serviceName: "Corte", durationMinutes: 30, day: "2026-11-07", time: "09:00", staffId: "ana" };
    const turn = retryAfterConflict(context({ times: () => [{ time: "10:00", staffId: "bia" }] }), booking);
    expect(turn.replies[0]).toContain("Esse horário acabou de ser ocupado.");
    expect(turn.state.step).toBe("time");
  });

  it("does nothing once the conversation is with the team", () => {
    const ended: BotState = { step: "ended", attempts: 0 };
    expect(stepBot(ended, "1", context())).toEqual({ replies: [], state: ended });
  });

  it("reads choices written in different ways, and refuses numbers out of range", () => {
    expect(pick("2", ["a", "b"])).toBe(1);
    expect(pick(" 2. ", ["a", "b"])).toBe(1);
    expect(pick("opção 1", ["a", "b"])).toBe(0);
    expect(pick("B", ["a", "b"])).toBe(1);
    expect(pick("3", ["a", "b"])).toBeNull();
    expect(pick("0", ["a", "b"])).toBeNull();
  });
});

describe("parseBotForm", () => {
  const values: Record<string, string> = {
    enabled: "on",
    welcome: "Olá!",
    handoffText: "Já vou chamar alguém.",
    option_0_label: "Agendar",
    option_0_action: "book",
    option_1_label: "Equipe",
    option_1_action: "handoff",
    option_1_department: "dep-1",
  };
  const form = (over: Record<string, string> = {}) => parseBotForm((n) => ({ ...values, ...over })[n] ?? null);

  it("keeps the filled options in order, dropping blank rows", () => {
    expect(form({ option_3_label: "" })).toMatchObject({
      ok: true,
      settings: {
        options: [
          { label: "Agendar", action: "book", reply: null, departmentId: null },
          { label: "Equipe", action: "handoff", reply: null, departmentId: "dep-1" },
        ],
      },
    });
  });

  it("refuses a bot that could trap a person or say nothing", () => {
    expect(form({ option_1_action: "book" })).toMatchObject({ ok: false, message: "Inclua uma opção para falar com a equipe." });
    expect(form({ option_2_label: "Preços", option_2_action: "reply" })).toMatchObject({ ok: false });
    expect(form({ welcome: "" })).toMatchObject({ ok: false });
  });

  it("allows saving it off while unfinished", () => {
    expect(form({ enabled: "", welcome: "", option_1_action: "book" })).toMatchObject({ ok: true });
  });
});
