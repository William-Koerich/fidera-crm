export const TEAM_ITEM_KINDS = ["endings", "departments", "labels"] as const;
export type TeamItemKind = (typeof TEAM_ITEM_KINDS)[number];

export const isTeamItemKind = (v: unknown): v is TeamItemKind => TEAM_ITEM_KINDS.includes(v as TeamItemKind);

const MAX_NAME: Record<TeamItemKind, number> = { endings: 80, departments: 80, labels: 40 };

/** Trimmed and with repeated spaces collapsed, or null when it cannot be saved. */
export function cleanItemName(kind: TeamItemKind, raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name && name.length <= MAX_NAME[kind] ? name : null;
}

export function cleanLabelColor(raw: string): string | null {
  const color = raw.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : null;
}

/** Records the channel has and the CRM lacks, and known names that gained a channel id. */
export function planImport(
  local: { id: string; name: string; external_id: string | null }[],
  remote: { id: string; name: string }[],
): { add: { name: string; externalId: string }[]; link: { id: string; externalId: string }[] } {
  const byName = new Map(local.map((l) => [l.name.toLowerCase(), l]));
  const add: { name: string; externalId: string }[] = [];
  const link: { id: string; externalId: string }[] = [];
  for (const record of remote) {
    const known = byName.get(record.name.trim().toLowerCase());
    if (!known) add.push({ name: record.name.trim(), externalId: record.id });
    else if (known.external_id !== record.id) link.push({ id: known.id, externalId: record.id });
  }
  return { add, link };
}
