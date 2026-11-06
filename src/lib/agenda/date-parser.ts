/**
 * Finds dates and times in a message, in Brazilian Portuguese, so the person answering can
 * click one to book it. A wrong guess costs little, since the form opens for review, but a
 * link on every number would be noise: "24h", "em 2h", "R$ 10,00" and "12/2026" stay plain text.
 *
 * Everything is relative to when the message was sent: "amanhã" written yesterday is today.
 */
import { addDays, isoToLocal, validDay, weekdayOf } from "./time";

export interface DateTimeMatch {
  start: number;
  end: number;
  text: string;
  /** Day to suggest. With only a time in the text, the next day that time can still happen. */
  date: string;
  time: string | null;
}

interface Token {
  start: number;
  end: number;
  date?: (time: string | null) => string | null;
  time?: string;
}

const BEFORE = "(?<![\\p{L}\\p{N}/.,:])";
const AFTER = "(?![\\p{L}\\p{N}])";
const MONTHS = ["janeiro", "fevereiro", "mar[çc]o", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAY_NAMES: [RegExp, number][] = [
  [/^domingo/i, 0],
  [/^segunda/i, 1],
  [/^ter[çc]a/i, 2],
  [/^quarta/i, 3],
  [/^quinta/i, 4],
  [/^sexta/i, 5],
  [/^s[áa]bado/i, 6],
];

const RELATIVE = new RegExp(`${BEFORE}(depois de amanh[ãa]|amanh[ãa]|hoje)${AFTER}`, "giu");
const WEEKDAY = new RegExp(
  `${BEFORE}(?:(?:n[oa]|pr[óo]xim[oa]|ess[ae]|est[ae]|nest[ae])\\s+)*((?:segunda|ter[çc]a|quarta|quinta|sexta)(?:[- ]feira)?|s[áa]bado|domingo)(?!\\s+(?:op[çc][ãa]o|vez|via|m[ãa]o))${AFTER}`,
  "giu",
);
const WRITTEN = new RegExp(`${BEFORE}(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MONTHS.join("|")})${AFTER}`, "giu");
const NUMERIC = new RegExp(`${BEFORE}(?:dia\\s+)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?(?![\\p{L}\\p{N}/])`, "giu");
const DAY_ONLY = new RegExp(`${BEFORE}dia\\s+(\\d{1,2})(?![\\p{L}\\p{N}/])`, "giu");
const PERIOD = "(?:\\s+da\\s+(manh[ãa]|tarde|noite))?";
const TIME = new RegExp(`${BEFORE}(?:([àa]s)\\s+)?(\\d{1,2})(?::(\\d{2})|\\s?h(?:oras?|rs?|s)?(?:\\s?(\\d{2}))?)${PERIOD}(?![\\p{L}\\p{N}:])`, "giu");
const BARE_HOUR = new RegExp(`${BEFORE}([àa]s)\\s+(\\d{1,2})${PERIOD}(?![\\p{L}\\p{N}:,./%])`, "giu");
/** "demora 2h", "em 3 horas": a duration, not a time. */
const DURATION_BEFORE = /(?:^|[^\p{L}])(?:em|por|h[áa]|dentro de|durante|uns|umas|cerca de|leva|demora)\s+$/iu;
/** What may stand between a date and a time that belong together. */
const JOINER = /^\s*(?:,|-|–|\.)?\s*(?:(?:de|pela|pra|para|a)\s+(?:manh[ãa]|tarde|noite)\s*)?(?:,|-|–)?\s*(?:[àa]s|a|de|do|da|no|na|pra|para|por\s+volta\s+d[ae]s)?\s*$/iu;

function clockTime(hourText: string, minuteText: string | undefined, period: string | undefined): string | null {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  if (period && /tarde|noite/i.test(period) && hour < 12) hour += 12;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** The first day from `today` on with that day of the month, skipping months that lack it. */
function nextDayOfMonth(today: string, day: number): string | null {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  for (let i = 0; i < 13; i += 1) {
    const candidate = validDay(year, month, day);
    if (candidate && candidate >= today) return candidate;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return null;
}

/** Day and month with no year: this year's, or next year's if that has passed. */
function nextDayAndMonth(today: string, day: number, month: number): string | null {
  const year = Number(today.slice(0, 4));
  const thisYear = validDay(year, month, day);
  if (!thisYear) return validDay(year + 1, month, day);
  return thisYear >= today ? thisYear : validDay(year + 1, month, day);
}

function dateTokens(text: string, today: string, now: string): Token[] {
  const tokens: Token[] = [];
  const add = (match: RegExpMatchArray, date: Token["date"]) =>
    tokens.push({ start: match.index!, end: match.index! + match[0].length, date });

  for (const m of text.matchAll(RELATIVE)) {
    const word = m[1]!.toLowerCase();
    const offset = word === "hoje" ? 0 : word.startsWith("depois") ? 2 : 1;
    add(m, () => addDays(today, offset));
  }
  for (const m of text.matchAll(WEEKDAY)) {
    const target = WEEKDAY_NAMES.find(([re]) => re.test(m[1]!))![1];
    const delta = (target - weekdayOf(today) + 7) % 7;
    // Naming today's weekday means today only if that time is still ahead.
    add(m, (time) => addDays(today, delta === 0 && !(time && time > now) ? 7 : delta));
  }
  for (const m of text.matchAll(WRITTEN)) {
    const month = MONTHS.findIndex((name) => new RegExp(`^${name}$`, "iu").test(m[2]!)) + 1;
    add(m, () => nextDayAndMonth(today, Number(m[1]), month));
  }
  for (const m of text.matchAll(NUMERIC)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (m[3]) {
      const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      add(m, () => validDay(year, month, day));
    } else {
      add(m, () => nextDayAndMonth(today, day, month));
    }
  }
  for (const m of text.matchAll(DAY_ONLY)) add(m, () => nextDayOfMonth(today, Number(m[1])));
  return tokens;
}

function timeTokens(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(TIME)) {
    if (!m[1] && DURATION_BEFORE.test(text.slice(0, m.index))) continue;
    const time = clockTime(m[2]!, m[3] ?? m[4], m[5]);
    if (time) tokens.push({ start: m.index, end: m.index + m[0].length, time });
  }
  for (const m of text.matchAll(BARE_HOUR)) {
    // "as 5 unidades" is not a time, while "às 5" and "as 5 da tarde" are.
    const unaccented = m[1]!.toLowerCase() === "as";
    if (unaccented && !m[3] && /^\s+\p{L}/u.test(text.slice(m.index + m[0].length))) continue;
    const time = clockTime(m[2]!, undefined, m[3]);
    if (time) tokens.push({ start: m.index, end: m.index + m[0].length, time });
  }
  return tokens;
}

/** Longest first, so "dia 12/11" wins over the "dia 12" inside it. */
function withoutOverlaps(tokens: Token[]): Token[] {
  const kept: Token[] = [];
  for (const token of [...tokens].sort((a, b) => b.end - b.start - (a.end - a.start))) {
    if (!kept.some((k) => token.start < k.end && token.end > k.start)) kept.push(token);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function findDateTimes(text: string, sentAt: string | Date): DateTimeMatch[] {
  const { date: today, time: now } = isoToLocal(sentAt);
  const tokens = withoutOverlaps([...dateTokens(text, today, now), ...timeTokens(text)]);

  const matches: DateTimeMatch[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const next = tokens[i + 1];
    const pairs = next && !!token.date !== !!next.date && JOINER.test(text.slice(token.end, next.start));
    const dateToken = token.date ? token : pairs ? next : undefined;
    const timeToken = token.time ? token : pairs ? next : undefined;
    const end = pairs ? next.end : token.end;
    if (pairs) i += 1;

    const time = timeToken?.time ?? null;
    const date = dateToken?.date ? dateToken.date(time) : time && time > now ? today : addDays(today, 1);
    if (!date) continue;
    matches.push({ start: token.start, end, text: text.slice(token.start, end), date, time });
  }
  return matches;
}
