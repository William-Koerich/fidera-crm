import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { parseDuration, toVoiceNote } = await import("./voice-note");

/** A real recording-like file, made with the same ffmpeg. */
function sample(extension: string, codec: string[], seconds = 3) {
  const out = join(mkdtempSync(join(tmpdir(), "vn-")), `sample.${extension}`);
  execFileSync(ffmpegPath!, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-ac", "2", ...codec, out]);
  return readFileSync(out);
}

function describeAudio(audio: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), "vn-"));
  const file = join(dir, "x.ogg");
  writeFileSync(file, audio);
  try {
    execFileSync(ffmpegPath!, ["-hide_banner", "-i", file], { stdio: "pipe" });
  } catch (e) {
    return String((e as { stderr: Buffer }).stderr);
  }
  return "";
}

describe("toVoiceNote", () => {
  it("turns an iPhone-style m4a and an mp3 into Ogg Opus mono", async () => {
    for (const input of [sample("m4a", ["-c:a", "aac"]), sample("mp3", ["-c:a", "libmp3lame"])]) {
      const result = await toVoiceNote(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.audio.subarray(0, 4).toString()).toBe("OggS");
      const info = describeAudio(result.audio);
      expect(info).toMatch(/Audio: opus, 48000 Hz, mono/);
      expect(result.seconds).toBeGreaterThan(2.5);
    }
  }, 30_000);

  it("refuses what is not audio, and recordings under a second", async () => {
    expect(await toVoiceNote(Buffer.from("not audio at all"))).toEqual({ ok: false, reason: "unreadable" });
    expect(await toVoiceNote(sample("m4a", ["-c:a", "aac"], 0.4))).toEqual({ ok: false, reason: "too_short" });
  }, 30_000);

  it("reads ffmpeg's duration", () => {
    expect(parseDuration("  Duration: 00:01:02.50, start: 0")).toBe(62.5);
    expect(parseDuration("nothing")).toBeNull();
  });
});
