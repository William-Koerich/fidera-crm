export type MediaKind = "image" | "audio" | "video" | "document";

/** WhatsApp limits most media to 16 MB. */
export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;

const ALLOWED: Record<string, { kind: MediaKind; extension: string }> = {
  "image/jpeg": { kind: "image", extension: "jpg" },
  "image/png": { kind: "image", extension: "png" },
  "image/webp": { kind: "image", extension: "webp" },
  "video/mp4": { kind: "video", extension: "mp4" },
  "audio/mpeg": { kind: "audio", extension: "mp3" },
  "audio/mp4": { kind: "audio", extension: "m4a" },
  "audio/ogg": { kind: "audio", extension: "ogg" },
  "application/pdf": { kind: "document", extension: "pdf" },
  "application/msword": { kind: "document", extension: "doc" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { kind: "document", extension: "docx" },
  "application/vnd.ms-excel": { kind: "document", extension: "xls" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { kind: "document", extension: "xlsx" },
  "text/plain": { kind: "document", extension: "txt" },
};

/** For the file picker. */
export const ATTACHMENT_ACCEPT = Object.keys(ALLOWED).join(",");

/** "audio/ogg; codecs=opus" -> "audio/ogg". */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0]!.trim().toLowerCase();
}

export function attachmentType(mimeType: string): { kind: MediaKind; extension: string } | null {
  return ALLOWED[baseMimeType(mimeType)] ?? null;
}

export function attachmentProblem(mimeType: string, size: number): "unsupported" | "too_large" | "empty" | null {
  if (!attachmentType(mimeType)) return "unsupported";
  if (size <= 0) return "empty";
  return size > MAX_ATTACHMENT_BYTES ? "too_large" : null;
}

/** The path keeps the extension because the receiving service may read the type from the address. */
export function attachmentPath(organizationId: string, conversationId: string, id: string, extension: string): string {
  return `${organizationId}/outbound/${conversationId}/${id}.${extension}`;
}

export function isAttachmentPathOf(path: string, organizationId: string, conversationId: string): boolean {
  return !path.includes("..") && path.startsWith(`${organizationId}/outbound/${conversationId}/`);
}

/**
 * Members can write these rows, and the server reads storage with full access, so a
 * stored path is only trusted inside the organization's own folder.
 */
export function isStoragePathOf(path: string, organizationId: string): boolean {
  return !path.includes("..") && path.startsWith(`${organizationId}/`);
}
