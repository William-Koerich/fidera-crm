const MEDIA_LABELS: Record<string, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contacts: "Contato",
  reaction: "Reação",
  template: "Modelo",
  interactive: "Mensagem interativa",
  unsupported: "Mensagem",
};

/** The database stores previews as "[image] caption": this is what people should read. */
export function previewText(preview: string | null): string | null {
  const match = preview ? /^\[([a-z]+)\](?: (.*))?$/s.exec(preview) : null;
  const label = match ? MEDIA_LABELS[match[1]!] : undefined;
  if (!match || !label) return preview;
  return match[2] ? `${label}: ${match[2]}` : label;
}

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

const TZ = "America/Sao_Paulo";
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });
const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: TZ });
const longDateFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: TZ });
const longDateYearFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });

/** YYYY-MM-DD in São Paulo time. */
export function dayKey(date: Date): string {
  return dayKeyFmt.format(date);
}

/** Whole days between two São Paulo calendar dates (b - a). */
function dayDiff(a: Date, b: Date): number {
  return Math.round((Date.parse(dayKey(b)) - Date.parse(dayKey(a))) / 86_400_000);
}

/** Inbox list: "14:05" today, "Ontem", weekday within a week, else dd/mm. */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff <= 0) return timeFmt.format(d);
  if (diff === 1) return "Ontem";
  if (diff < 7) {
    const w = weekdayFmt.format(d);
    return w.charAt(0).toUpperCase() + w.slice(1).replace("-feira", "");
  }
  return dateFmt.format(d);
}

/** Conversation day separator: "Hoje", "Ontem", "3 de novembro" (year only if different). */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff <= 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return dayKey(d).slice(0, 4) === dayKey(now).slice(0, 4) ? longDateFmt.format(d) : longDateYearFmt.format(d);
}

const fullFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
export function formatDate(iso: string): string {
  return fullFmt.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** How a channel is named to people. */
export function channelLabel(channel: string): string {
  return channel === "whatsapp" ? "WhatsApp" : channel === "instagram" ? "Instagram" : channel === "webchat" ? "Chat do site" : channel;
}
