/** Long enough to answer, short enough that a later "5" is not mistaken for a rating. */
export const NPS_ANSWER_WINDOW_MS = 24 * 3_600_000;
/** Nobody wants to rate every visit, and fewer automated messages protect the number. */
export const NPS_CONTACT_COOLDOWN_MS = 30 * 24 * 3_600_000;

export interface NpsTotals {
  promoters: number;
  detractors: number;
  answered: number;
}

/** Share of promoters minus share of detractors, from -100 to 100. Null with no answers. */
export function npsScore({ promoters, detractors, answered }: NpsTotals): number | null {
  return answered > 0 ? Math.round(((promoters - detractors) / answered) * 100) : null;
}

/** A survey may go out unless this person was asked recently. */
export function canAskAgain(lastSentAt: string | null, now: Date): boolean {
  return !lastSentAt || now.getTime() - new Date(lastSentAt).getTime() >= NPS_CONTACT_COOLDOWN_MS;
}

export function parseNpsForm(get: (name: string) => string | null):
  | { ok: true; enabled: boolean; question: string; thanks: string }
  | { ok: false; message: string } {
  const enabled = get("enabled") === "on";
  const question = (get("question") ?? "").trim();
  const thanks = (get("thanks") ?? "").trim();
  if (question.length > 1000 || thanks.length > 1000) return { ok: false, message: "Texto longo demais." };
  if (enabled && !question) return { ok: false, message: "Escreva a pergunta da avaliação." };
  if (enabled && !thanks) return { ok: false, message: "Escreva o agradecimento." };
  return { ok: true, enabled, question, thanks };
}
