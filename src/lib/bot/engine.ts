/**
 * The conversation the bot holds. Pure: given its state and what the customer wrote, it says what
 * to answer, the next state and what should happen (book, hand over). The runner does the I/O.
 */
import { formatDay } from "../agenda/time";
import { durationLabel } from "../agenda/form";
import type { BotSettings } from "./config";

export type BotStep = "menu" | "service" | "day" | "time" | "confirm" | "ended";

export interface BotState {
  step: BotStep;
  attempts: number;
  serviceId?: string;
  day?: string;
  time?: string;
  staffId?: string;
  /** What each number meant in the last list sent. */
  offered?: string[];
}

export interface BotService {
  id: string;
  name: string;
  durationMinutes: number;
}

export interface BotContext {
  settings: BotSettings;
  services: BotService[];
  /** Next days with free times for that duration. */
  days: (durationMinutes: number) => string[];
  /** Free times that day, with who would take each. */
  times: (day: string, durationMinutes: number) => { time: string; staffId: string }[];
}

export interface Booking {
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  day: string;
  time: string;
  staffId: string;
}

export interface BotTurn {
  replies: string[];
  state: BotState;
  book?: Booking;
  handoff?: { departmentId: string | null };
}

const MAX_ATTEMPTS = 2;
const MAX_LIST = 9;
const BACK = "Digite 0 para voltar ao menu.";

const numbered = (items: string[]) => items.map((item, i) => `${i + 1} - ${item}`).join("\n");

/** The chosen position: "2", "2.", "opção 2", or the option's own words. */
export function pick(text: string, labels: string[]): number | null {
  const value = text.trim().toLowerCase();
  const number = /^(?:op[çc][ãa]o\s*)?(\d{1,2})\s*[.)!]?$/.exec(value);
  if (number) {
    const index = Number(number[1]) - 1;
    return index >= 0 && index < labels.length ? index : null;
  }
  const index = labels.findIndex((label) => label.trim().toLowerCase() === value);
  return index >= 0 ? index : null;
}

function menu(context: BotContext, intro?: string): BotTurn {
  const labels = context.settings.options.map((o) => o.label);
  return {
    replies: [`${intro ? `${intro}\n\n` : ""}${numbered(labels)}\n\nResponda com o número da opção.`],
    state: { step: "menu", attempts: 0 },
  };
}

function handoff(context: BotContext, departmentId: string | null, prefix?: string): BotTurn {
  const text = prefix ? `${prefix} ${context.settings.handoffText}` : context.settings.handoffText;
  return { replies: [text], state: { step: "ended", attempts: 0 }, handoff: { departmentId } };
}

function offerDays(context: BotContext, service: BotService, intro?: string): BotTurn {
  const days = context.days(service.durationMinutes);
  if (days.length === 0) return handoff(context, null, `Não encontrei horários livres para ${service.name.toLowerCase()} nos próximos dias.`);
  return {
    replies: [`${intro ? `${intro}\n\n` : ""}Qual dia é melhor para você?\n${numbered(days.map(formatDay))}\n\n${BACK}`],
    state: { step: "day", attempts: 0, serviceId: service.id, offered: days },
  };
}

function offerTimes(context: BotContext, service: BotService, day: string, intro?: string): BotTurn {
  const times = context.times(day, service.durationMinutes).slice(0, MAX_LIST);
  if (times.length === 0) return offerDays(context, service, `${intro ? `${intro} ` : ""}Não há mais horários livres em ${formatDay(day).toLowerCase()}.`);
  return {
    replies: [`${intro ? `${intro}\n\n` : ""}Horários livres em ${formatDay(day).toLowerCase()}:\n${numbered(times.map((t) => t.time))}\n\n${BACK}`],
    state: { step: "time", attempts: 0, serviceId: service.id, day, offered: times.map((t) => `${t.time}|${t.staffId}`) },
  };
}

/** The first answer when the bot takes a new conversation. */
export function startBot(context: BotContext): BotTurn {
  return menu(context, context.settings.welcome);
}

function misunderstood(context: BotContext, state: BotState): BotTurn {
  const attempts = state.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) return handoff(context, null, "Não consegui entender.");
  return { replies: ["Não entendi. Responda só com o número de uma das opções."], state: { ...state, attempts } };
}

export function stepBot(state: BotState, text: string, context: BotContext): BotTurn {
  const value = text.trim().toLowerCase();
  if (state.step === "ended") return { replies: [], state };
  if (/^(0|menu|voltar)$/.test(value)) return menu(context);
  if (/^(atendente|falar com algu[ée]m|humano|pessoa)$/.test(value)) return handoff(context, null);

  const service = context.services.find((s) => s.id === state.serviceId);

  if (state.step === "menu") {
    const index = pick(text, context.settings.options.map((o) => o.label));
    if (index === null) return misunderstood(context, state);
    const option = context.settings.options[index]!;
    if (option.action === "handoff") return handoff(context, option.departmentId);
    if (option.action === "reply") return { replies: [`${option.reply}\n\n${BACK}`], state: { step: "menu", attempts: 0 } };
    const services = context.services.slice(0, MAX_LIST);
    if (services.length === 0) return handoff(context, null);
    return {
      replies: [`Qual serviço você quer agendar?\n${numbered(services.map((s) => `${s.name} (${durationLabel(s.durationMinutes)})`))}\n\n${BACK}`],
      state: { step: "service", attempts: 0, offered: services.map((s) => s.id) },
    };
  }

  const offered = state.offered ?? [];
  const index = pick(text, offered.map((_, i) => String(i + 1)));

  if (state.step === "service") {
    const chosen = index === null ? undefined : context.services.find((s) => s.id === offered[index]);
    return chosen ? offerDays(context, chosen) : misunderstood(context, state);
  }
  if (!service) return menu(context, "Vamos recomeçar.");

  if (state.step === "day") {
    return index === null ? misunderstood(context, state) : offerTimes(context, service, offered[index]!);
  }

  if (state.step === "time") {
    if (index === null) return misunderstood(context, state);
    const [time, staffId] = offered[index]!.split("|") as [string, string];
    return {
      replies: [`Confirma ${service.name.toLowerCase()} em ${formatDay(state.day!).toLowerCase()}, às ${time}?\n1 - Sim, confirmar\n2 - Escolher outro horário`],
      state: { ...state, step: "confirm", attempts: 0, time, staffId, offered: [] },
    };
  }

  // confirm
  const answer = pick(text, ["sim", "não"]) ?? (/^(sim|s|confirmo|ok)$/.test(value) ? 0 : /^(n[ãa]o|n)$/.test(value) ? 1 : null);
  if (answer === null) return misunderstood(context, state);
  if (answer === 1) return offerTimes(context, service, state.day!);
  return {
    replies: [],
    state: { step: "ended", attempts: 0 },
    book: { serviceId: service.id, serviceName: service.name, durationMinutes: service.durationMinutes, day: state.day!, time: state.time!, staffId: state.staffId! },
  };
}

/** After the bot could not book because someone took the time first. */
export function retryAfterConflict(context: BotContext, booking: Booking): BotTurn {
  const service = context.services.find((s) => s.id === booking.serviceId);
  if (!service) return handoff(context, null);
  return offerTimes(context, service, booking.day, "Esse horário acabou de ser ocupado.");
}

export function bookedText(booking: Booking): string {
  return `Pronto! Seu horário de ${booking.serviceName.toLowerCase()} ficou marcado para ${formatDay(booking.day).toLowerCase()}, às ${booking.time}. Até lá!`;
}
