import { localDateTimeToIso, validDay } from "./time";

export * from "./time";

export const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240] as const;
export const APPOINTMENT_STATUSES = ["scheduled", "done", "no_show", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface AppointmentValues {
  clientName: string;
  startsAt: string;
  endsAt: string;
  service: string | null;
  notes: string | null;
  staffId: string | null;
}

export function parseAppointmentForm(
  get: (name: string) => string | null,
): { ok: true; values: AppointmentValues } | { ok: false; message: string } {
  const clientName = (get("clientName") ?? "").trim();
  if (!clientName || clientName.length > 120) return { ok: false, message: "Escreva o nome do cliente." };

  const date = get("date") ?? "";
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!parts || !validDay(Number(parts[1]), Number(parts[2]), Number(parts[3]))) return { ok: false, message: "Escolha uma data válida." };
  const time = get("time") ?? "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, message: "Escolha um horário válido." };
  const duration = DURATIONS.find((d) => d === Number(get("duration")));
  if (!duration) return { ok: false, message: "Escolha a duração." };

  const service = (get("service") ?? "").trim();
  const notes = (get("notes") ?? "").trim();
  if (service.length > 120) return { ok: false, message: "Nome do serviço longo demais." };
  if (notes.length > 1000) return { ok: false, message: "Observação longa demais." };

  const startsAt = localDateTimeToIso(date, time);
  return {
    ok: true,
    values: {
      clientName,
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + duration * 60_000).toISOString(),
      service: service || null,
      notes: notes || null,
      staffId: get("staffId") || null,
    },
  };
}
