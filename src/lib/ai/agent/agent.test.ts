import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { Availability } from "../../bot/slots";
import { agentQuietReason, defaultAgentSettings, parseAgentForm, type AgentSettings } from "./config";
import { MAX_TOOL_ROUNDS, runAgentTurn, type CreateMessage } from "./loop";
import { contextPrompt, historyToMessages, stablePrompt } from "./prompt";
import { agentTools, runAgentTool, type AgentPort, type UpcomingAppointment } from "./tools";

// Friday 2026-11-06, 10:00 in Brasília.
const NOW = new Date("2026-11-06T13:00:00Z");
const open = { open: "09:00", close: "12:00" };
const businessHours = { "5": open, "6": open };
const settings: AgentSettings = { ...defaultAgentSettings(), enabled: true };
const services = [{ id: "corte", name: "Corte", durationMinutes: 60 }];
const at = (day: string, time: string) => new Date(`${day}T${time}:00-03:00`).toISOString();

function fakePort(overrides: Partial<AgentPort> = {}, upcoming: UpcomingAppointment[] = []) {
  const availability: Availability = { businessHours, staff: [{ id: "ana", workHours: null }], booked: [], now: NOW };
  return {
    availability: vi.fn(async () => availability),
    upcoming: vi.fn(async () => upcoming),
    book: vi.fn(async () => ({ ok: true as const, id: "new" })),
    cancel: vi.fn(async () => true),
    handoff: vi.fn(async () => {}),
    ...overrides,
  } satisfies AgentPort;
}

describe("parseAgentForm", () => {
  const form = (values: Record<string, string>) => (name: string) => values[name] ?? null;
  const valid = { enabled: "on", instructions: "Seja gentil.", mode: "always", pauseAfterTeamHours: "12", canBook: "on" };

  it("reads a complete form", () => {
    const parsed = parseAgentForm(form(valid));
    expect(parsed).toEqual({
      ok: true,
      settings: { enabled: true, instructions: "Seja gentil.", mode: "always", canBook: true, canCancel: false, pauseAfterTeamHours: 12, handoffDepartmentId: null },
    });
  });

  it("will not turn on without instructions, and checks the choices", () => {
    expect(parseAgentForm(form({ ...valid, instructions: "  " })).ok).toBe(false);
    expect(parseAgentForm(form({ ...valid, enabled: "", instructions: "" })).ok).toBe(true);
    expect(parseAgentForm(form({ ...valid, mode: "sometimes" })).ok).toBe(false);
    expect(parseAgentForm(form({ ...valid, pauseAfterTeamHours: "5" })).ok).toBe(false);
    expect(parseAgentForm(form({ ...valid, instructions: "x".repeat(6001) })).ok).toBe(false);
  });
});

describe("agentQuietReason", () => {
  const base = { settings, now: NOW, businessHours, pausedUntil: null, lastTeamMessageAt: null, aiRepliesLastDay: 0 };

  it("answers when on and nobody from the team is in the conversation", () => {
    expect(agentQuietReason(base)).toBeNull();
  });

  it("stays quiet when off, paused, or the team wrote recently", () => {
    expect(agentQuietReason({ ...base, settings: { ...settings, enabled: false } })).toBe("off");
    expect(agentQuietReason({ ...base, pausedUntil: "2026-11-06T14:00:00Z" })).toBe("paused");
    expect(agentQuietReason({ ...base, pausedUntil: "2026-11-06T12:00:00Z" })).toBeNull();
    expect(agentQuietReason({ ...base, lastTeamMessageAt: "2026-11-06T02:00:00Z" })).toBe("team_active");
    expect(agentQuietReason({ ...base, lastTeamMessageAt: "2026-11-05T12:00:00Z" })).toBeNull();
    expect(agentQuietReason({ ...base, aiRepliesLastDay: 40 })).toBe("conversation_limit");
  });

  it("only answers outside business hours in that mode", () => {
    const outside = { ...settings, mode: "outside_hours" as const };
    expect(agentQuietReason({ ...base, settings: outside })).toBe("business_hours");
    expect(agentQuietReason({ ...base, settings: outside, now: new Date("2026-11-06T20:00:00Z") })).toBeNull();
  });
});

describe("prompts", () => {
  it("puts the business's instructions, services and hours in the cached part", () => {
    const text = stablePrompt({ settings: { ...settings, instructions: "Nome: Bia." }, services, businessHours });
    expect(text).toContain("<instrucoes_do_negocio>\nNome: Bia.\n</instrucoes_do_negocio>");
    expect(text).toContain("Corte (id: corte, 60 min)");
    expect(text).toContain("Sexta: 09:00 às 12:00");
    expect(text).toContain("Domingo: fechado");
  });

  it("says so when the AI may not book", () => {
    expect(stablePrompt({ settings: { ...settings, canBook: false }, services, businessHours })).toContain("Você não agenda");
  });

  it("names today and the coming days, so weekdays are never guessed", () => {
    const text = contextPrompt({ now: NOW, clientName: "Ana", channel: "whatsapp" });
    expect(text).toContain("Agora: Sexta, 06/11/2026, 10:00");
    expect(text).toContain("Sábado, 07/11/2026 = 2026-11-07 (amanhã)");
    expect(text).toContain("Cliente: Ana. Canal: WhatsApp.");
  });

  it("turns the conversation into turns that start and end with the customer", () => {
    const messages = historyToMessages([
      { direction: "outbound", type: "text", body: "Promoção!" },
      { direction: "inbound", type: "text", body: "Oi" },
      { direction: "inbound", type: "audio", body: null },
      { direction: "outbound", type: "text", body: "Olá!" },
      { direction: "inbound", type: "text", body: "Quero marcar" },
    ]);
    expect(messages).toEqual([
      { role: "user", content: "Oi\n[o cliente mandou um áudio]" },
      { role: "assistant", content: "Olá!" },
      { role: "user", content: "Quero marcar" },
    ]);
  });

  it("has nothing to answer when the business spoke last", () => {
    expect(historyToMessages([{ direction: "inbound", type: "text", body: "Oi" }, { direction: "outbound", type: "text", body: "Olá" }])).toBeNull();
  });
});

describe("agentTools", () => {
  it("offers booking and cancelling only when allowed", () => {
    const names = (s: AgentSettings) => agentTools(s).map((t) => t.name);
    expect(names(settings)).toEqual(["ver_horarios_livres", "meus_agendamentos", "chamar_equipe", "agendar", "cancelar_agendamento"]);
    expect(names({ ...settings, canBook: false, canCancel: false })).toEqual(["ver_horarios_livres", "meus_agendamentos", "chamar_equipe"]);
  });
});

describe("runAgentTool", () => {
  const run = (name: string, input: unknown, port = fakePort(), s = settings) => runAgentTool(name, input, { settings: s, services, port });

  it("lists the free times of a day, or the next days with room", async () => {
    expect((await run("ver_horarios_livres", { servico_id: "corte", dia: "2026-11-07" })).content).toContain("09:00, 09:30, 10:00, 10:30, 11:00");
    const next = await run("ver_horarios_livres", { servico_id: "corte", dia: "" });
    expect(next.content).toContain("Sexta, 06/11 (2026-11-06): 11:00");
    expect(next.content).toContain("Sábado, 07/11 (2026-11-07)");
  });

  it("rejects unknown services and past or malformed days", async () => {
    expect((await run("ver_horarios_livres", { servico_id: "x", dia: "" })).isError).toBe(true);
    expect((await run("ver_horarios_livres", { servico_id: "corte", dia: "2026-11-05" })).content).toBe("Esse dia já passou.");
    expect((await run("ver_horarios_livres", { servico_id: "corte", dia: "sábado" })).isError).toBe(true);
  });

  it("books a free time with the person who has it", async () => {
    const port = fakePort();
    const outcome = await run("agendar", { servico_id: "corte", dia: "2026-11-07", horario: "10:00", nome_cliente: "Ana" }, port);
    expect(port.book).toHaveBeenCalledWith({
      clientName: "Ana",
      serviceName: "Corte",
      staffId: "ana",
      startsAt: at("2026-11-07", "10:00"),
      endsAt: at("2026-11-07", "11:00"),
    });
    expect(outcome.action).toEqual({ kind: "booked", service: "Corte", day: "2026-11-07", time: "10:00", staff: null });
  });

  it("never books a time that is not free, and offers the others", async () => {
    const port = fakePort();
    const outcome = await run("agendar", { servico_id: "corte", dia: "2026-11-07", horario: "11:30", nome_cliente: "Ana" }, port);
    expect(port.book).not.toHaveBeenCalled();
    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain("Livres nesse dia: 09:00");
  });

  it("asks for the name before booking, and respects the setting", async () => {
    expect((await run("agendar", { servico_id: "corte", dia: "2026-11-07", horario: "10:00", nome_cliente: " " })).content).toContain("nome");
    const off = await run("agendar", { servico_id: "corte", dia: "2026-11-07", horario: "10:00", nome_cliente: "Ana" }, fakePort(), { ...settings, canBook: false });
    expect(off.isError).toBe(true);
  });

  it("tries again with fresh times when someone took the slot meanwhile", async () => {
    const book = vi.fn().mockResolvedValueOnce({ ok: false, reason: "conflict" }).mockResolvedValueOnce({ ok: true, id: "new" });
    const port = fakePort({ book });
    const outcome = await run("agendar", { servico_id: "corte", dia: "2026-11-07", horario: "10:00", nome_cliente: "Ana" }, port);
    expect(port.availability).toHaveBeenLastCalledWith(true);
    expect(outcome.action?.kind).toBe("booked");
  });

  it("only cancels this client's own appointments", async () => {
    const mine = { id: "a1", service: "Corte", startsAt: at("2026-11-07", "09:00"), staffId: "ana" };
    const port = fakePort({}, [mine]);
    expect((await run("cancelar_agendamento", { agendamento_id: "someone-else" }, port)).isError).toBe(true);
    expect(port.cancel).not.toHaveBeenCalled();
    const outcome = await run("cancelar_agendamento", { agendamento_id: "a1" }, port);
    expect(port.cancel).toHaveBeenCalledWith("a1");
    expect(outcome.action).toEqual({ kind: "cancelled", service: "Corte", day: "2026-11-07", time: "09:00" });
  });

  it("hands the conversation to the team", async () => {
    const port = fakePort();
    const outcome = await run("chamar_equipe", { motivo: "Quer desconto" }, port);
    expect(port.handoff).toHaveBeenCalledWith("Quer desconto");
    expect(outcome.action).toEqual({ kind: "handoff", reason: "Quer desconto" });
  });
});

describe("runAgentTurn", () => {
  const message = (content: Anthropic.Beta.BetaContentBlock[], stop: Anthropic.Beta.BetaMessage["stop_reason"]) =>
    ({ content, stop_reason: stop }) as unknown as Anthropic.Beta.BetaMessage;
  const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as Anthropic.Beta.BetaContentBlock;
  const text = (t: string) => ({ type: "text", text: t }) as Anthropic.Beta.BetaContentBlock;
  const base = { system: [], messages: [{ role: "user" as const, content: "Oi" }], tools: [] };

  it("runs the tools, returns every result together, and sends the final text", async () => {
    const createMessage = vi
      .fn<CreateMessage>()
      .mockResolvedValueOnce(message([toolUse("t1", "a", {}), toolUse("t2", "b", {})], "tool_use"))
      .mockResolvedValueOnce(message([text('"Agendado para sábado!"')], "end_turn"));
    const runTool = vi.fn(async (name: string) => ({
      content: `ok ${name}`,
      action: name === "a" ? ({ kind: "handoff", reason: "x" } as const) : undefined,
    }));
    const turn = await runAgentTurn({ ...base, createMessage, runTool });
    expect(turn).toEqual({ status: "reply", text: "Agendado para sábado!", actions: [{ kind: "handoff", reason: "x" }] });
    const second = createMessage.mock.calls[1]![0].messages;
    expect(second.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: "ok a" },
        { type: "tool_result", tool_use_id: "t2", content: "ok b" },
      ],
    });
  });

  it("reports a declined request and stops a loop that never ends", async () => {
    const declined = vi.fn<CreateMessage>().mockResolvedValue(message([], "refusal"));
    expect((await runAgentTurn({ ...base, createMessage: declined, runTool: vi.fn() })).status).toBe("declined");

    const looping = vi.fn<CreateMessage>().mockResolvedValue(message([toolUse("t", "a", {})], "tool_use"));
    const turn = await runAgentTurn({ ...base, createMessage: looping, runTool: async () => ({ content: "ok" }) });
    expect(turn).toEqual({ status: "failed", actions: [], reason: "too_many_rounds" });
    expect(looping).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS + 1);
  });

  it("turns a crashing tool into an error result instead of failing the turn", async () => {
    const createMessage = vi
      .fn<CreateMessage>()
      .mockResolvedValueOnce(message([toolUse("t1", "a", {})], "tool_use"))
      .mockResolvedValueOnce(message([text("Vou chamar a equipe.")], "end_turn"));
    const turn = await runAgentTurn({ ...base, createMessage, runTool: async () => Promise.reject(new Error("db down")) });
    expect(turn.status).toBe("reply");
    expect(createMessage.mock.calls[1]![0].messages.at(-1)).toMatchObject({ content: [{ is_error: true }] });
  });
});

describe("choosing a professional", () => {
  const staff = [
    { id: "ana", name: "Ana" },
    { id: "bia", name: "Bia" },
  ];
  // Ana is busy at 10:00 on Saturday; Bia is free all morning.
  const port = () => {
    const availability: Availability = {
      businessHours,
      staff: [
        { id: "ana", workHours: null },
        { id: "bia", workHours: null },
      ],
      booked: [{ staffId: "ana", startsAt: at("2026-11-07", "10:00"), endsAt: at("2026-11-07", "11:00") }],
      now: NOW,
    };
    return fakePort({ availability: vi.fn(async () => availability) });
  };
  const run = (name: string, input: unknown, p = port()) => runAgentTool(name, input, { settings, services, port: p, staff });

  it("lists only the chosen person's free times", async () => {
    const ana = await run("ver_horarios_livres", { servico_id: "corte", dia: "2026-11-07", profissional_id: "ana" });
    expect(ana.content).toBe("Horários livres para Corte com Ana em Sábado, 07/11 (2026-11-07): 09:00, 11:00.");
    const anyone = await run("ver_horarios_livres", { servico_id: "corte", dia: "2026-11-07", profissional_id: "" });
    expect(anyone.content).toContain("09:00, 09:30, 10:00, 10:30, 11:00");
  });

  it("books with the chosen person, and says who in the note", async () => {
    const p = port();
    const outcome = await run("agendar", { servico_id: "corte", dia: "2026-11-07", horario: "10:00", nome_cliente: "Rita", profissional_id: "bia" }, p);
    expect(p.book).toHaveBeenCalledWith(expect.objectContaining({ staffId: "bia" }));
    expect(outcome.action).toEqual({ kind: "booked", service: "Corte", day: "2026-11-07", time: "10:00", staff: "Bia" });
  });

  it("refuses a time the chosen person does not have, and unknown people", async () => {
    const p = port();
    const busy = await run("agendar", { servico_id: "corte", dia: "2026-11-07", horario: "10:00", nome_cliente: "Rita", profissional_id: "ana" }, p);
    expect(busy.isError).toBe(true);
    expect(busy.content).toContain("com Ana");
    expect(p.book).not.toHaveBeenCalled();
    expect((await run("ver_horarios_livres", { servico_id: "corte", dia: "", profissional_id: "x@y.com" })).isError).toBe(true);
  });

  it("names the professionals in the prompt, and never offers a choice without names", () => {
    expect(stablePrompt({ settings, services, businessHours, staff })).toContain("- Bia (id: bia)");
    expect(stablePrompt({ settings, services, businessHours, staff: [] })).toContain("não ofereça escolha de profissional");
  });
});

describe("what the salon sent", () => {
  it("shows the AI that a voice note went out, instead of an empty message", () => {
    expect(
      historyToMessages([
        { direction: "inbound", type: "text", body: "Oi" },
        { direction: "outbound", type: "audio", body: null },
        { direction: "inbound", type: "text", body: "Quero marcar" },
      ]),
    ).toEqual([
      { role: "user", content: "Oi" },
      { role: "assistant", content: "[o salão enviou um áudio]" },
      { role: "user", content: "Quero marcar" },
    ]);
  });
});
