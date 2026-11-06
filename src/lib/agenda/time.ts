/** Agenda dates are Brasília calendar days and clock times. Brazil has no daylight saving today. */
const TIME_ZONE = "America/Sao_Paulo";
const OFFSET = "-03:00";

export function localDateTimeToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00${OFFSET}`).toISOString();
}

export function isoToLocal(at: string | Date): { date: string; time: string } {
  const value = typeof at === "string" ? new Date(at) : at;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
  return { date, time };
}

/** Calendar arithmetic on "2026-11-06". */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The Monday of that date's week: salons think in working weeks. */
export function weekStart(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** A real calendar day, or null. */
export function validDay(year: number, month: number, day: number): string | null {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
    ? value.toISOString().slice(0, 10)
    : null;
}

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** "Sábado, 07/11". */
export function formatDay(date: string): string {
  return `${WEEKDAYS[weekdayOf(date)]}, ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}
