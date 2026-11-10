/** How a person on the team is shown: their name, or the start of their e-mail until they set one. */
export function memberName(member: { email: string; name?: string | null } | undefined | null, fallback = "Ex-integrante da equipe"): string {
  if (!member) return fallback;
  return member.name?.trim() || member.email.split("@")[0]!;
}
