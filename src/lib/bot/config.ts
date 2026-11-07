export const BOT_ACTIONS = ["reply", "book", "handoff"] as const;
export type BotAction = (typeof BOT_ACTIONS)[number];
export const MAX_BOT_OPTIONS = 6;

export interface BotOption {
  label: string;
  action: BotAction;
  /** Text sent back, for "reply". */
  reply: string | null;
  /** Where "handoff" sends the conversation. */
  departmentId: string | null;
}

export interface BotSettings {
  enabled: boolean;
  welcome: string;
  handoffText: string;
  options: BotOption[];
}

export function parseBotForm(get: (name: string) => string | null): { ok: true; settings: BotSettings } | { ok: false; message: string } {
  const enabled = get("enabled") === "on";
  const welcome = (get("welcome") ?? "").trim();
  const handoffText = (get("handoffText") ?? "").trim();
  if (welcome.length > 1000 || handoffText.length > 1000) return { ok: false, message: "Texto longo demais." };

  const options: BotOption[] = [];
  for (let i = 0; i < MAX_BOT_OPTIONS; i += 1) {
    const label = (get(`option_${i}_label`) ?? "").trim();
    if (!label) continue;
    if (label.length > 40) return { ok: false, message: `Opção ${i + 1}: use até 40 letras.` };
    const action = BOT_ACTIONS.find((a) => a === get(`option_${i}_action`));
    if (!action) return { ok: false, message: `Opção ${i + 1}: escolha o que ela faz.` };
    const reply = (get(`option_${i}_reply`) ?? "").trim();
    if (action === "reply" && !reply) return { ok: false, message: `Opção ${i + 1}: escreva a resposta.` };
    if (reply.length > 1000) return { ok: false, message: `Opção ${i + 1}: resposta longa demais.` };
    options.push({ label, action, reply: action === "reply" ? reply : null, departmentId: action === "handoff" ? get(`option_${i}_department`) || null : null });
  }

  if (enabled) {
    if (!welcome) return { ok: false, message: "Escreva a mensagem de boas-vindas." };
    if (!handoffText) return { ok: false, message: "Escreva o aviso de que a equipe vai responder." };
    if (options.length === 0) return { ok: false, message: "Cadastre ao menos uma opção." };
    if (!options.some((o) => o.action === "handoff")) return { ok: false, message: "Inclua uma opção para falar com a equipe." };
  }
  return { ok: true, settings: { enabled, welcome, handoffText, options } };
}
