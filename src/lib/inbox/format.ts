/** "3h 20min", "12min", "menos de 1min" for a remaining duration in ms. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "encerrada";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "menos de 1min";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/** "+55 (48) 99999-0000" for Brazilian normalized numbers, "+<digits>" otherwise. */
export function formatPhone(normalized: string | null | undefined): string {
  if (!normalized) return "";
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(normalized);
  if (br) return `+55 (${br[1]}) ${br[2]}-${br[3]}`;
  return `+${normalized}`;
}

/** Opens WhatsApp (app or web) with the text ready to send: free, no API cost. */
export function whatsAppLink(phoneNormalized: string, text?: string): string {
  const url = new URL(`https://wa.me/${phoneNormalized.replace(/\D/g, "")}`);
  if (text) url.searchParams.set("text", text);
  return url.toString();
}

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** Time today, otherwise dd/mm (São Paulo time). */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  return dateFmt.format(d) === dateFmt.format(now) ? timeFmt.format(d) : dateFmt.format(d);
}

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}
