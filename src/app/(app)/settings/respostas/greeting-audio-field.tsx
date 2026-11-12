"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { getBrowserClient } from "@/lib/supabase/client";
import { prepareGreetingUploadAction, processGreetingAudioAction } from "./greeting-audio-actions";

/** Same bucket as MEDIA_BUCKET, which is server-only. */
const MEDIA_BUCKET = "crm-media";

type Status = { kind: "idle" } | { kind: "recording"; startedAt: number } | { kind: "working"; label: string } | { kind: "error"; message: string };

const ACCEPT = "audio/*,.m4a,.mp3,.ogg,.oga,.opus,.aac,.wav,.amr,.webm";

/**
 * The greeting's voice note: record it here or pick a file from the phone. Either way the server
 * turns it into a WhatsApp voice note, and the form saves the path in a hidden field.
 */
export function GreetingAudioField({ initialPath, initialUrl }: { initialPath: string | null; initialUrl: string | null }) {
  const [path, setPath] = useState(initialPath);
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status.kind !== "recording") return;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - status.startedAt) / 1000)), 250);
    return () => clearInterval(timer);
  }, [status]);

  // Release the microphone if the page closes mid-recording.
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function upload(file: Blob, mimeType: string) {
    setStatus({ kind: "working", label: "Enviando…" });
    try {
      const ticket = await prepareGreetingUploadAction({ mimeType, size: file.size });
      if (!ticket.ok) return setStatus({ kind: "error", message: ticket.message });
      const { error } = await getBrowserClient()
        .storage.from(MEDIA_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: mimeType || "application/octet-stream" });
      if (error) return setStatus({ kind: "error", message: "Não foi possível enviar o áudio. Tente de novo." });
      setStatus({ kind: "working", label: "Preparando como mensagem de voz…" });
      const result = await processGreetingAudioAction(ticket.path);
      if (!result.ok) return setStatus({ kind: "error", message: result.message });
      setPath(result.path);
      setUrl(result.url);
      setStatus({ kind: "idle" });
    } catch {
      setStatus({ kind: "error", message: "Não foi possível enviar o áudio. Tente de novo." });
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return setStatus({ kind: "error", message: "Este navegador não grava áudio. Escolha um arquivo gravado no celular." });
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const media = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunks.current = [];
      media.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = media.mimeType || preferred || "audio/webm";
        void upload(new Blob(chunks.current, { type }), type);
      };
      recorder.current = media;
      media.start();
      setElapsed(0);
      setStatus({ kind: "recording", startedAt: Date.now() });
    } catch {
      setStatus({ kind: "error", message: "Sem acesso ao microfone. Libere o microfone no navegador ou escolha um arquivo." });
    }
  }

  const busy = status.kind === "working" || status.kind === "recording";
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="grid gap-3 rounded-xl bg-sunken/60 p-3">
      <input type="hidden" name="greeting_audio_path" value={path ?? ""} />
      {path && url && status.kind !== "recording" ? (
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">Áudio da saudação</p>
          <audio controls preload="metadata" src={url} className="w-full" />
          <p className="text-xs text-text-muted">Chega como mensagem de voz, como se você tivesse gravado na hora. Ouça antes de salvar.</p>
        </div>
      ) : null}

      {status.kind === "recording" ? (
        <div className="flex items-center gap-3">
          <span aria-hidden className="size-3 animate-pulse rounded-full bg-danger" />
          <span className="text-sm font-medium tabular" role="timer" aria-live="off">
            Gravando {clock}
          </span>
          <Button type="button" size="sm" onClick={() => recorder.current?.stop()}>
            Parar e usar
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void startRecording()}>
            {path ? "Gravar outro" : "Gravar agora"}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
            {path ? "Trocar por um arquivo" : "Escolher arquivo"}
          </Button>
          {path ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setPath(null);
                setUrl(null);
              }}
            >
              Remover
            </Button>
          ) : null}
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file, file.type);
            }}
          />
        </div>
      )}

      {status.kind === "working" ? (
        <p className="text-sm text-text-muted" role="status">
          {status.label}
        </p>
      ) : null}
      {status.kind === "error" ? <Alert tone="danger">{status.message}</Alert> : null}
      {!path && status.kind === "idle" ? (
        <p className="text-xs text-text-muted">Grave aqui pelo computador ou celular, ou envie um áudio gravado no WhatsApp ou no gravador do celular. Até 3 minutos.</p>
      ) : null}
    </div>
  );
}
