/**
 * Where the greeting's voice note lives. Pure, so the path rules are tested without storage.
 * The browser uploads the original under raw/; the server converts it and keeps only the .ogg.
 */
export const MAX_GREETING_UPLOAD_BYTES = 16 * 1024 * 1024;

export const greetingRawPath = (organizationId: string, id: string) => `${organizationId}/greetings/raw/${id}`;
export const greetingAudioPath = (organizationId: string, id: string) => `${organizationId}/greetings/${id}.ogg`;

const safe = (path: string) => !path.includes("..") && !path.includes("//");

export function isGreetingRawPathOf(path: string, organizationId: string): boolean {
  return safe(path) && /^[0-9a-f-]{36}$/.test(path.slice(`${organizationId}/greetings/raw/`.length)) && path.startsWith(`${organizationId}/greetings/raw/`);
}

export function isGreetingAudioPathOf(path: string, organizationId: string): boolean {
  const prefix = `${organizationId}/greetings/`;
  return safe(path) && path.startsWith(prefix) && /^[0-9a-f-]{36}\.ogg$/.test(path.slice(prefix.length));
}

/** Phones label recordings in many ways (m4a, opus, amr...); ffmpeg decides what it can read. */
export function greetingUploadProblem(file: { mimeType: string; size: number }): "too_large" | "empty" | "unsupported" | null {
  if (file.size <= 0) return "empty";
  if (file.size > MAX_GREETING_UPLOAD_BYTES) return "too_large";
  const type = file.mimeType.split(";")[0]!.trim().toLowerCase();
  if (type && !type.startsWith("audio/") && type !== "video/webm" && type !== "video/mp4" && type !== "application/octet-stream") return "unsupported";
  return null;
}
