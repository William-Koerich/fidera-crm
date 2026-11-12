"use server";

import { randomUUID } from "node:crypto";
import { canManage, requireMembership } from "@/lib/auth";
import { logEvent } from "@/lib/log";
import { toVoiceNote } from "@/lib/media/voice-note";
import { greetingAudioPath, greetingRawPath, greetingUploadProblem, isGreetingRawPathOf } from "@/lib/replies/greeting-audio";
import { createAdminClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/webhooks/media";

export type GreetingUpload = { ok: true; path: string; token: string } | { ok: false; message: string };
export type GreetingAudio = { ok: true; path: string; url: string; seconds: number } | { ok: false; message: string };

const PROBLEMS = {
  too_large: "O áudio passou de 16 MB. Grave um mais curto.",
  empty: "O arquivo está vazio.",
  unsupported: "Escolha um arquivo de áudio.",
} as const;

async function requireManager() {
  const me = await requireMembership();
  return canManage(me.role) ? me : null;
}

/** A one-time address for the browser to upload the original recording, past the server's body limit. */
export async function prepareGreetingUploadAction(file: { mimeType: string; size: number }): Promise<GreetingUpload> {
  const me = await requireManager();
  if (!me) return { ok: false, message: "Apenas donos e administradores podem alterar respostas." };
  const problem = greetingUploadProblem(file);
  if (problem) return { ok: false, message: PROBLEMS[problem] };
  const path = greetingRawPath(me.organizationId, randomUUID());
  const { data, error } = await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "Não foi possível preparar o envio. Tente de novo." };
  return { ok: true, path, token: data.token };
}

/**
 * Converts the uploaded recording into a WhatsApp voice note and keeps only that. Nothing changes
 * in the settings until the form is saved.
 */
export async function processGreetingAudioAction(rawPath: string): Promise<GreetingAudio> {
  const me = await requireManager();
  if (!me) return { ok: false, message: "Apenas donos e administradores podem alterar respostas." };
  if (!isGreetingRawPathOf(rawPath, me.organizationId)) return { ok: false, message: "Envie o áudio de novo." };

  const storage = createAdminClient().storage.from(MEDIA_BUCKET);
  try {
    const { data: original } = await storage.download(rawPath);
    if (!original) return { ok: false, message: "Envie o áudio de novo." };
    const converted = await toVoiceNote(Buffer.from(await original.arrayBuffer()));
    if (!converted.ok) {
      if (converted.reason === "unavailable") logEvent("greeting_audio.ffmpeg_missing", {}, "error");
      return {
        ok: false,
        message:
          converted.reason === "too_short"
            ? "O áudio ficou curto demais. Grave pelo menos um segundo."
            : converted.reason === "unreadable"
              ? "Não consegui ler esse arquivo. Tente gravar aqui ou envie um áudio do celular."
              : "Não foi possível converter o áudio agora. Tente de novo.",
      };
    }
    const path = greetingAudioPath(me.organizationId, randomUUID());
    const { error } = await storage.upload(path, converted.audio, { contentType: "audio/ogg", upsert: false });
    if (error) return { ok: false, message: "Não foi possível guardar o áudio. Tente de novo." };
    const { data: signed } = await storage.createSignedUrl(path, 3600);
    return { ok: true, path, url: signed?.signedUrl ?? "", seconds: Math.round(converted.seconds) };
  } finally {
    await storage.remove([rawPath]);
  }
}
