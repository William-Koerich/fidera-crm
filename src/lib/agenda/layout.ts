/**
 * Where appointments sit on the agenda grid: top and height from the clock, and side by side when
 * they overlap. Pure, so it is tested without a browser.
 */
import type { BusinessHours } from "../replies/auto-reply";
import { weekdayOf } from "./time";

export const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const toClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export interface Placed<T> {
  item: T;
  start: number;
  end: number;
  /** Which of `columns` side-by-side lanes it takes. */
  lane: number;
  lanes: number;
}

/**
 * Overlapping appointments share the width, each in its own lane, like a paper agenda. A group of
 * appointments that touch each other, directly or through others, uses one lane count.
 */
export function layoutDay<T>(items: T[], range: (item: T) => { start: number; end: number }): Placed<T>[] {
  const sorted = items
    .map((item) => {
      const { start, end } = range(item);
      return { item, start, end };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed<T>[] = [];
  let group: Placed<T>[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;

  const close = () => {
    for (const p of group) p.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };

  for (const entry of sorted) {
    if (entry.start >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= entry.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.end);
    } else laneEnds[lane] = entry.end;
    const p: Placed<T> = { ...entry, lane, lanes: 1 };
    group.push(p);
    placed.push(p);
    groupEnd = Math.max(groupEnd, entry.end);
  }
  close();
  return placed;
}

/** Whole hours to show: the opening hours of these days and every appointment, at least 8h to 20h. */
export function hourRange(days: string[], hours: BusinessHours, items: { date: string; start: number; end: number }[]): { from: number; to: number } {
  let from = 8;
  let to = 20;
  for (const day of days) {
    const open = hours[String(weekdayOf(day))];
    if (!open) continue;
    from = Math.min(from, Math.floor(toMinutes(open.open) / 60));
    to = Math.max(to, Math.ceil(toMinutes(open.close) / 60));
  }
  for (const item of items) {
    if (!days.includes(item.date)) continue;
    from = Math.min(from, Math.floor(item.start / 60));
    to = Math.max(to, Math.min(24, Math.ceil(item.end / 60)));
  }
  return { from, to };
}

/** The open part of a day, in minutes, or null when closed. */
export function openWindow(day: string, hours: BusinessHours): { start: number; end: number } | null {
  const open = hours[String(weekdayOf(day))];
  return open ? { start: toMinutes(open.open), end: toMinutes(open.close) } : null;
}
