/**
 * Labels and funnel stages. A stage is a label with a place in the funnel; a contact sits in one
 * stage at a time, so picking a stage takes the contact out of the others. Pure, tested alone.
 */

export interface LabelInfo {
  id: string;
  name: string;
  color: string;
  /** Place in the funnel, or null for a plain label. */
  stagePosition: number | null;
}

export const isStage = (label: Pick<LabelInfo, "stagePosition">) => label.stagePosition !== null;

/** Stages in funnel order, then plain labels by name. */
export function sortLabels<T extends LabelInfo>(labels: T[]): T[] {
  return [...labels].sort((a, b) => {
    if (isStage(a) !== isStage(b)) return isStage(a) ? -1 : 1;
    if (isStage(a) && a.stagePosition !== b.stagePosition) return a.stagePosition! - b.stagePosition!;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

/**
 * What to add and remove when a label is turned on or off for a contact. Turning a stage on
 * leaves the other stages; plain labels never touch each other.
 */
export function planLabelChange(
  labels: LabelInfo[],
  current: string[],
  labelId: string,
  on: boolean,
): { add: string[]; remove: string[] } {
  const label = labels.find((l) => l.id === labelId);
  if (!label) return { add: [], remove: [] };
  const has = new Set(current);
  if (!on) return { add: [], remove: has.has(labelId) ? [labelId] : [] };
  const remove = isStage(label) ? labels.filter((l) => isStage(l) && l.id !== labelId && has.has(l.id)).map((l) => l.id) : [];
  return { add: has.has(labelId) ? [] : [labelId], remove };
}

/** Colors offered for new labels, so making one is a single tap. */
export const LABEL_COLORS = ["#6d28d9", "#2563eb", "#0891b2", "#059669", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#475569"];

/** The next color nobody uses yet, so labels made in a row look different. */
export function nextLabelColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return LABEL_COLORS.find((c) => !taken.has(c)) ?? LABEL_COLORS[used.length % LABEL_COLORS.length] ?? "#6d28d9";
}

/** A starting funnel for a salon, offered when there is none yet. */
export const SUGGESTED_STAGES: { name: string; color: string }[] = [
  { name: "Novo lead", color: "#2563eb" },
  { name: "Em conversa", color: "#ca8a04" },
  { name: "Agendou", color: "#6d28d9" },
  { name: "Virou cliente", color: "#059669" },
  { name: "Perdido", color: "#475569" },
];

/** Positions after a stage moves one place; the others keep their order. */
export function reorderStages(stageIds: string[], id: string, direction: -1 | 1): string[] {
  const from = stageIds.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= stageIds.length) return stageIds;
  const next = [...stageIds];
  next[from] = stageIds[to]!;
  next[to] = id;
  return next;
}
