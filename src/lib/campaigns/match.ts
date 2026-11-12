/**
 * Recognizing a campaign's message. People rarely send it untouched: the phone may change
 * capitals, accents and emojis, and some add "bom dia" before it. Pure, so it is tested alone.
 */

export interface CampaignTrigger {
  id: string;
  triggerText: string;
}

/** Lowercase letters and digits only, single spaces: "Olá! Quero o CURSO 😍" -> "ola quero o curso". */
export function normalizeMessage(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Short triggers must match whole; longer ones may lose a few words along the way. */
const MIN_WORDS_FOR_PARTIAL = 4;
const PARTIAL_SHARE = 0.85;
/** A partial match only counts in a message about as long as the trigger. */
const PARTIAL_EXTRA_WORDS = 6;

/**
 * How well a message matches a trigger: 0 is no match. The whole trigger inside the message
 * (with anything before or after) is the best; most of its words, in a message not much longer,
 * also counts. A message that is only part of the trigger ("oi") never matches.
 */
export function matchScore(message: string, trigger: string): number {
  const m = normalizeMessage(message);
  const t = normalizeMessage(trigger);
  if (!m || t.length < 3) return 0;
  if (` ${m} `.includes(` ${t} `)) return 2 + t.length / 10_000;

  const triggerWords = [...new Set(t.split(" "))];
  if (triggerWords.length < MIN_WORDS_FOR_PARTIAL) return 0;
  const messageWords = m.split(" ");
  if (messageWords.length > triggerWords.length + PARTIAL_EXTRA_WORDS) return 0;
  const present = new Set(messageWords);
  const share = triggerWords.filter((w) => present.has(w)).length / triggerWords.length;
  return share >= PARTIAL_SHARE ? share : 0;
}

/** The campaign this message belongs to; the most specific wins when several match. */
export function findCampaign<T extends CampaignTrigger>(message: string, campaigns: T[]): T | null {
  let best: { campaign: T; score: number } | null = null;
  for (const campaign of campaigns) {
    const score = matchScore(message, campaign.triggerText);
    if (score > 0 && (!best || score > best.score)) best = { campaign, score };
  }
  return best?.campaign ?? null;
}
