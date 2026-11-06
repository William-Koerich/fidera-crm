export const PERIOD_PRESETS = [7, 30, 90] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
const DEFAULT_PERIOD: PeriodPreset = 30;
const TIME_ZONE = "America/Sao_Paulo";

/** "2026-11-06" as seen in Brasília. */
export function localDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function parsePreset(raw: unknown): PeriodPreset {
  const days = Number(raw);
  return PERIOD_PRESETS.find((p) => p === days) ?? DEFAULT_PERIOD;
}

/** The last `days` days, today included. Calendar arithmetic only, so daylight saving cannot shift it. */
export function periodFor(days: number, now: Date): { from: string; to: string } {
  const to = localDate(now);
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to };
}

/** A real calendar day in the format the database expects, or null. */
export function parseDay(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : null;
}

/** Atendimentos a month at this pace, to compare with a plan's allowance. */
export function monthlyPace(total: number, days: number): number {
  return Math.round((total / days) * 30);
}

/** "45 s", "12 min", "3 h 20 min", "2 d 4 h". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return hours % 24 === 0 ? `${days} d` : `${days} d ${hours % 24} h`;
}

/** Above this many days, single-day bars get too thin to read on a phone. */
const MAX_DAILY_BARS = 45;

export interface ChartBucket {
  label: string;
  attendances: number;
}

const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** One bucket per day, or per seven days counted from the start of a long period. */
export function chartBuckets(days: { day: string; attendances: number }[]): { unit: "dia" | "semana"; buckets: ChartBucket[] } {
  if (days.length <= MAX_DAILY_BARS) {
    return { unit: "dia", buckets: days.map((d) => ({ label: shortDay(d.day), attendances: d.attendances })) };
  }
  const buckets: ChartBucket[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    buckets.push({
      label: `${shortDay(week[0]!.day)} a ${shortDay(week.at(-1)!.day)}`,
      attendances: week.reduce((sum, d) => sum + d.attendances, 0),
    });
  }
  return { unit: "semana", buckets };
}
