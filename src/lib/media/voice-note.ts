import "server-only";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

/** Long enough for a welcome; WhatsApp plays longer, but nobody listens to it. */
export const MAX_VOICE_NOTE_SECONDS = 180;

export type VoiceNoteResult =
  | { ok: true; audio: Buffer; seconds: number }
  | { ok: false; reason: "unreadable" | "too_short" | "unavailable" };

function run(args: string[]): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath!, args, { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }, (error, _stdout, stderr) =>
      error ? reject(Object.assign(error, { stderr })) : resolve({ stderr }),
    );
  });
}

/** "Duration: 00:01:02.50" from ffmpeg's report. */
export function parseDuration(report: string): number | null {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(report);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
}

/**
 * Turns any recording (phone memo, WhatsApp audio, browser recording) into what WhatsApp sends as
 * a voice note: Ogg Opus, mono, 48 kHz. Sent as a fresh file, it shows as recorded on the spot,
 * never as forwarded. Files go through disk: some formats (m4a) cannot be read from a pipe.
 */
export async function toVoiceNote(input: Buffer): Promise<VoiceNoteResult> {
  if (!ffmpegPath) return { ok: false, reason: "unavailable" };
  const id = randomUUID();
  const source = join(tmpdir(), `${id}-in`);
  const target = join(tmpdir(), `${id}.ogg`);
  try {
    await writeFile(source, input);
    const { stderr } = await run([
      "-hide_banner",
      "-y",
      "-i",
      source,
      "-vn",
      "-map_metadata",
      "-1",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-application",
      "voip",
      "-t",
      String(MAX_VOICE_NOTE_SECONDS),
      "-f",
      "ogg",
      target,
    ]);
    const original = parseDuration(stderr);
    const audio = await readFile(target);
    const seconds = Math.min(original ?? 0, MAX_VOICE_NOTE_SECONDS);
    if (audio.length < 200 || (original !== null && original < 1)) return { ok: false, reason: "too_short" };
    return { ok: true, audio, seconds };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    await Promise.all([rm(source, { force: true }), rm(target, { force: true })]);
  }
}
