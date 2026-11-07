/**
 * Free times for a service, from the salon's opening hours, each person's work hours and the
 * appointments already booked. Everything is Brasília clock time, in minutes since midnight.
 */
import type { BusinessHours } from "../replies/auto-reply";
import { addDays, isoToLocal, weekdayOf } from "../agenda/time";

export const SLOT_STEP_MINUTES = 30;
/** Nobody wants a booking that starts before they can get ready. */
export const MIN_NOTICE_MINUTES = 60;

export interface Staff {
  id: string;
  /** Null: follows the salon's opening hours. */
  workHours: BusinessHours | null;
}

export interface Booked {
  staffId: string | null;
  startsAt: string;
  endsAt: string;
}

export interface Availability {
  businessHours: BusinessHours;
  staff: Staff[];
  booked: Booked[];
  now: Date;
}

export interface Slot {
  time: string;
  staffId: string;
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function window(hours: BusinessHours | null, fallback: BusinessHours, day: string): [number, number] | null {
  const today = (hours ?? fallback)[String(weekdayOf(day))];
  return today ? [toMinutes(today.open), toMinutes(today.close)] : null;
}

/** Bookings on that day, in minutes. One spanning midnight only counts on the day it starts. */
function bookedOn(booked: Booked[], day: string) {
  return booked.flatMap((b) => {
    const start = isoToLocal(b.startsAt);
    if (start.date !== day) return [];
    const end = isoToLocal(b.endsAt);
    return [{ staffId: b.staffId, start: toMinutes(start.time), end: end.date === day ? toMinutes(end.time) : 24 * 60 }];
  });
}

export function freeSlots(day: string, durationMinutes: number, availability: Availability): Slot[] {
  const salon = window(availability.businessHours, availability.businessHours, day);
  if (!salon) return [];
  const now = isoToLocal(availability.now);
  if (day < now.date) return [];
  const earliest = day === now.date ? toMinutes(now.time) + MIN_NOTICE_MINUTES : 0;
  const booked = bookedOn(availability.booked, day);
  const load = (staffId: string) => booked.filter((b) => b.staffId === staffId).length;

  const slots: Slot[] = [];
  for (let start = salon[0]; start + durationMinutes <= salon[1]; start += SLOT_STEP_MINUTES) {
    if (start < earliest) continue;
    const end = start + durationMinutes;
    const overlaps = (b: { start: number; end: number }) => b.start < end && b.end > start;
    const free = availability.staff.filter((person) => {
      const hours = window(person.workHours, availability.businessHours, day);
      if (!hours || start < hours[0] || end > hours[1]) return false;
      return !booked.some((b) => b.staffId === person.id && overlaps(b));
    });
    // A booking with no one assigned still takes someone's time.
    const unassigned = booked.filter((b) => b.staffId === null && overlaps(b)).length;
    if (free.length <= unassigned) continue;
    const chosen = [...free].sort((a, b) => load(a.id) - load(b.id) || a.id.localeCompare(b.id))[0]!;
    slots.push({ time: toTime(start), staffId: chosen.id });
  }
  return slots;
}

/** The next days with at least one free time, starting today. */
export function daysWithSlots(durationMinutes: number, availability: Availability, { limit = 6, horizon = 14 } = {}): string[] {
  const today = isoToLocal(availability.now).date;
  const days: string[] = [];
  for (let i = 0; i < horizon && days.length < limit; i += 1) {
    const day = addDays(today, i);
    if (freeSlots(day, durationMinutes, availability).length > 0) days.push(day);
  }
  return days;
}
