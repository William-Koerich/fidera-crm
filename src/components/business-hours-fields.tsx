import { Input } from "@/components/ui/field";
import { WEEKDAYS, type BusinessHours } from "@/lib/replies/auto-reply";

/** Suggested when nothing was saved yet. */
const DEFAULT_DAYS = new Set([1, 2, 3, 4, 5, 6]);
const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "18:00";

/** One row per weekday. Read on the server with parseBusinessHours, using the same prefix. */
export function BusinessHoursFields({ hours, prefix = "" }: { hours: BusinessHours; prefix?: string }) {
  const hasHours = Object.keys(hours).length > 0;
  return (
    <ul className="divide-y divide-border">
      {WEEKDAYS.map((day, index) => {
        const today = hours[String(index)];
        return (
          <li key={day} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <label className="flex min-h-11 w-28 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                name={`${prefix}day_${index}_enabled`}
                defaultChecked={hasHours ? !!today : DEFAULT_DAYS.has(index)}
                className="size-5 accent-brand"
              />
              {day}
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                name={`${prefix}day_${index}_open`}
                aria-label={`${day}: começa às`}
                defaultValue={today?.open ?? DEFAULT_OPEN}
                className="w-32"
              />
              <span className="text-sm text-text-muted">às</span>
              <Input
                type="time"
                name={`${prefix}day_${index}_close`}
                aria-label={`${day}: termina às`}
                defaultValue={today?.close ?? DEFAULT_CLOSE}
                className="w-32"
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
