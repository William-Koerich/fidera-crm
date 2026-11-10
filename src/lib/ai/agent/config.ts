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

/** Where a new business starts: a filled-in example they change, not a blank page. */
export const DEFAULT_INSTRUCTIONS = `Você é a atendente virtual do salão. Seu nome é Ana.

Sobre o salão:
- Endereço: (escreva aqui o endereço)
- Formas de pagamento: Pix, cartão e dinheiro.
- Estacionamento: (tem ou não tem)

Preços:
- (escreva aqui os serviços e preços, por exemplo: Corte feminino R$ 80)

Como atender:
- Seja simpática e breve, como numa conversa de WhatsApp.
- Quando o cliente quiser marcar, pergunte o serviço e o dia, veja os horários livres e confirme antes de agendar.
- Atrasos de mais de 15 minutos podem precisar ser remarcados.
- Se pedirem desconto, reclamarem ou perguntarem algo que você não sabe, chame a equipe.`;

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
