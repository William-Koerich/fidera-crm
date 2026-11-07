import { formatDay } from "./time";

export interface Callback {
  contactId: string;
  contactName: string | null;
  phone: string | null;
  conversationId: string | null;
  serviceId: string;
  serviceName: string;
  lastVisitAt: string;
  lastVisitOn: string;
  dueOn: string;
}

/** Whole days between two calendar days. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A first message for the person to review. Personal, with no pressure and no price. */
export function callbackText(callback: Pick<Callback, "contactName" | "serviceName" | "lastVisitOn">, today: string): string {
  const firstName = callback.contactName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Oi, ${firstName}! Tudo bem?` : "Oi! Tudo bem?";
  const days = daysBetween(callback.lastVisitOn, today);
  const since = days >= 60 ? `há uns ${Math.round(days / 30)} meses` : `há ${days} dias`;
  // "horário de" keeps the sentence right whatever the service's grammatical gender.
  return `${greeting} Seu último horário de ${callback.serviceName.toLowerCase()} foi ${since}. Quer que eu reserve um horário para você esta semana?`;
}

/** "Venceu hoje", "Venceu há 3 dias". */
export function dueLabel(dueOn: string, today: string): string {
  const late = daysBetween(dueOn, today);
  if (late <= 0) return "Venceu hoje";
  return late === 1 ? "Venceu ontem" : `Venceu há ${late} dias`;
}

export function lastVisitLabel(lastVisitOn: string): string {
  return `Última visita: ${formatDay(lastVisitOn).toLowerCase()}`;
}
