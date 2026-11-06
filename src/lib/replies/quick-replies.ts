export interface QuickReply {
  id: string;
  shortcut: string;
  body: string;
}

export const MAX_REPLY_LENGTH = 4096;
const SHORTCUT = /^[a-z0-9-]{1,30}$/;

/** "/Horário de Sábado" -> "horario-de-sabado"; null when nothing valid is left. */
export function normalizeShortcut(raw: string): string | null {
  const value = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^\/+/, "")
    .replace(/[\s_]+/g, "-");
  return SHORTCUT.test(value) ? value : null;
}

/**
 * What the composer's text asks for: the query after a leading "/" while it is
 * still one word, or null when the person is writing a normal message.
 */
export function slashQuery(text: string): string | null {
  return /^\/\S*$/.test(text) ? text.slice(1).toLowerCase() : null;
}

/** Shortcuts starting with the query first, then those containing it. */
export function filterQuickReplies(replies: QuickReply[], query: string): QuickReply[] {
  const starts = replies.filter((r) => r.shortcut.startsWith(query));
  const contains = replies.filter((r) => !r.shortcut.startsWith(query) && r.shortcut.includes(query));
  return [...starts, ...contains];
}
