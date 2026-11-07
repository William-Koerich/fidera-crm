import { formatDay, localDateTimeToIso, validDay } from "./time";

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

export interface ServiceOption {
  id: string;
  name: string;
  durationMinutes: number;
  /** When a client should come back for it. Null keeps it out of "Chamar hoje". */
  returnAfterDays?: number | null;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The listed service with this exact name, ignoring case and surrounding spaces. */
export function matchService(services: ServiceOption[], typed: string): ServiceOption | undefined {
  const name = typed.trim().toLowerCase();
  return name ? services.find((s) => s.name.toLowerCase() === name) : undefined;
}

export function parseServiceForm(
  get: (name: string) => string | null,
): { ok: true; name: string; durationMinutes: number; returnAfterDays: number | null } | { ok: false; message: string } {
  const name = (get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) return { ok: false, message: "Escreva o nome do serviço." };
  const durationMinutes = DURATIONS.find((d) => d === Number(get("duration")));
  if (!durationMinutes) return { ok: false, message: "Escolha a duração." };
  const rawReturn = (get("returnAfterDays") ?? "").trim();
  const returnAfterDays = rawReturn ? Number(rawReturn) : null;
  if (returnAfterDays !== null && (!Number.isInteger(returnAfterDays) || returnAfterDays < 1 || returnAfterDays > 365)) {
    return { ok: false, message: "O retorno precisa ser de 1 a 365 dias, ou vazio." };
  }
  return { ok: true, name, durationMinutes, returnAfterDays };
}

export interface SavedAppointment {
  clientName: string;
  date: string;
  time: string;
  service: string | null;
}

/** A confirmation for the person to review and send. A phone number is not a name to greet. */
export function confirmationText(saved: SavedAppointment, useName: boolean): string {
  const firstName = useName ? saved.clientName.trim().split(/\s+/)[0] : "";
  const greeting = firstName ? `Olá, ${firstName}!` : "Olá!";
  const service = saved.service ? ` (${saved.service})` : "";
  return `${greeting} Seu horário ficou marcado para ${formatDay(saved.date).toLowerCase()}, às ${saved.time}${service}. Até lá!`;
}
