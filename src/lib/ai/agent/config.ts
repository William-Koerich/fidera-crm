/**
 * The AI attendant's settings, and when it answers. Pure, so it is tested without the database.
 */
import { isWithinBusinessHours, type BusinessHours } from "../../replies/auto-reply";

export const AGENT_MODES = ["always", "outside_hours"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];
export const MAX_INSTRUCTIONS_CHARS = 6000;
export const PAUSE_OPTIONS_HOURS = [1, 2, 4, 8, 12, 24, 48, 72] as const;
/** A conversation that keeps going (two bots talking, someone testing) stops getting AI replies. */
export const MAX_AI_REPLIES_PER_CONVERSATION_PER_DAY = 40;
/** When the AI hands a conversation to the team, it stays out of it this long. */
export const HANDOFF_PAUSE_HOURS = 24;

export interface AgentSettings {
  enabled: boolean;
  instructions: string;
  mode: AgentMode;
  canBook: boolean;
  canCancel: boolean;
  pauseAfterTeamHours: number;
  handoffDepartmentId: string | null;
}

/**
 * Where every business starts: works as is, with nothing to fill in. Facts the business has not
 * written (address, prices) are never guessed: the AI says the team will confirm and calls them.
 */
export const DEFAULT_INSTRUCTIONS = `Você é a assistente virtual do salão e se chama Ana.

Jeito de falar:
- Simpática, acolhedora e breve, como numa conversa de WhatsApp. Uma ideia por mensagem.
- Chame o cliente pelo primeiro nome quando souber. Pode usar um emoji de vez em quando, sem exagero.
- Na primeira mensagem de uma conversa, cumprimente e pergunte como pode ajudar.

Agendamentos:
- Quando o cliente quiser marcar, descubra o serviço e o dia que ele prefere. Se ele não tiver um dia em mente, mostre os próximos dias com vaga.
- Ofereça no máximo três horários por vez, os mais próximos do que ele pediu.
- Antes de agendar, confirme serviço, dia e horário e espere o cliente dizer que sim.
- Depois de agendar, confirme com dia da semana, data e horário, e peça para avisar se precisar desmarcar.
- Para remarcar ou cancelar, veja os agendamentos dele e confirme qual antes de mexer.

O que você não sabe:
- Endereço, preços, formas de pagamento e promoções: só informe o que estiver escrito aqui. Se não estiver, diga que vai confirmar com a equipe e chame a equipe.

Chame a equipe quando:
- O cliente pedir para falar com uma pessoa, reclamar ou parecer chateado.
- Pedirem desconto, orçamento de serviço que não está na lista, ou falarem de pagamento.
- A mensagem não for sobre o salão (assunto pessoal, fornecedor, vaga de emprego).`;

export function defaultAgentSettings(): AgentSettings {
  return {
    enabled: false,
    instructions: DEFAULT_INSTRUCTIONS,
    mode: "always",
    canBook: true,
    canCancel: true,
    pauseAfterTeamHours: 12,
    handoffDepartmentId: null,
  };
}

export function parseAgentForm(
  get: (name: string) => string | null,
): { ok: true; settings: AgentSettings } | { ok: false; message: string } {
  const enabled = get("enabled") === "on";
  const instructions = (get("instructions") ?? "").replace(/\r\n/g, "\n").trim();
  if (instructions.length > MAX_INSTRUCTIONS_CHARS) {
    return { ok: false, message: `As instruções passaram de ${MAX_INSTRUCTIONS_CHARS} letras. Encurte um pouco.` };
  }
  if (enabled && !instructions) return { ok: false, message: "Escreva as instruções da IA antes de ligar." };
  const mode = AGENT_MODES.find((m) => m === get("mode"));
  if (!mode) return { ok: false, message: "Escolha quando a IA responde." };
  const pause = Number(get("pauseAfterTeamHours"));
  if (!PAUSE_OPTIONS_HOURS.some((h) => h === pause)) return { ok: false, message: "Escolha por quanto tempo a IA fica quieta." };
  return {
    ok: true,
    settings: {
      enabled,
      instructions,
      mode,
      canBook: get("canBook") === "on",
      canCancel: get("canCancel") === "on",
      pauseAfterTeamHours: pause,
      handoffDepartmentId: get("handoffDepartmentId") || null,
    },
  };
}

export type QuietReason = "off" | "business_hours" | "paused" | "team_active" | "conversation_limit" | "busy";

/**
 * Whether the AI answers this conversation now. The team always wins: once someone writes,
 * or the AI handed the conversation over, it stays out.
 */
export function agentQuietReason(input: {
  settings: AgentSettings;
  now: Date;
  businessHours: BusinessHours;
  pausedUntil: string | null;
  lastTeamMessageAt: string | null;
  aiRepliesLastDay: number;
}): QuietReason | null {
  const { settings, now } = input;
  if (!settings.enabled) return "off";
  if (settings.mode === "outside_hours" && isWithinBusinessHours(now, input.businessHours)) return "business_hours";
  if (input.pausedUntil && Date.parse(input.pausedUntil) > now.getTime()) return "paused";
  if (input.lastTeamMessageAt && now.getTime() - Date.parse(input.lastTeamMessageAt) < settings.pauseAfterTeamHours * 3_600_000) {
    return "team_active";
  }
  if (input.aiRepliesLastDay >= MAX_AI_REPLIES_PER_CONVERSATION_PER_DAY) return "conversation_limit";
  return null;
}
