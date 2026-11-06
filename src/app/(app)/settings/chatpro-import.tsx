"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { importChatProSessionAction, listChatProSessionsAction } from "./channel-actions";

/** ChatPro rejects fast sequences with 429 and does not say how long to wait. */
const PAUSE_MS = 2_000;
const RATE_LIMIT_WAIT_MS = 20_000;
const MAX_RATE_LIMIT_RETRIES = 6;

type Progress =
  | { step: "idle" }
  | { step: "running"; done: number; total: number; waiting: boolean; inserted: number }
  | { step: "finished"; total: number; inserted: number; failed: number }
  | { step: "error" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Brings the conversations ChatPro already holds into the inbox, one at a time. */
export function ChatProImport() {
  const [progress, setProgress] = useState<Progress>({ step: "idle" });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  /** Runs `call` until it stops being rate limited. Null when ChatPro never lets it through. */
  async function withRetry<T extends { status: string }>(call: () => Promise<T>, onWait: () => void): Promise<T | null> {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES && !cancelled.current; attempt += 1) {
      const result = await call();
      if (result.status !== "rate_limited") return result;
      onWait();
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS));
    }
    return null;
  }

  async function run() {
    setProgress({ step: "running", done: 0, total: 0, waiting: false, inserted: 0 });
    const list = await withRetry(listChatProSessionsAction, () =>
      setProgress({ step: "running", done: 0, total: 0, waiting: true, inserted: 0 }),
    ).catch(() => null);
    if (cancelled.current) return;
    if (list?.status !== "ok") {
      setProgress({ step: "error" });
      return;
    }

    const total = list.sessions.length;
    let inserted = 0;
    let failed = 0;
    for (const [done, session] of list.sessions.entries()) {
      if (cancelled.current) return;
      setProgress({ step: "running", done, total, waiting: false, inserted });
      const result = await withRetry(
        () => importChatProSessionAction(session),
        () => setProgress({ step: "running", done, total, waiting: true, inserted }),
      ).catch(() => null);
      if (result?.status === "ok") inserted += result.inserted;
      else failed += 1;
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
    if (!cancelled.current) setProgress({ step: "finished", total, inserted, failed });
  }

  const running = progress.step === "running";

  return (
    <div className="grid gap-3 rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium">Trazer mensagens para a inbox</p>
        <p className="mt-1 text-sm text-text-muted">
          Importa as conversas individuais que já estão no ChatPro, até 200 mensagens por conversa. Conversas em grupo não
          entram, e mensagens de antes da conexão com o ChatPro não estão disponíveis. Pode repetir: nada é duplicado.
        </p>
      </div>

      {progress.step === "running" ? (
        <p role="status" className="text-sm text-text-muted">
          {progress.waiting
            ? "O ChatPro pediu uma pausa. Continuando em instantes…"
            : progress.total === 0
              ? "Buscando conversas…"
              : `Importando conversa ${progress.done + 1} de ${progress.total}. Mantenha esta página aberta.`}
        </p>
      ) : null}

      {progress.step === "finished" ? (
        <Alert tone={progress.failed > 0 ? "warning" : "success"}>
          {progress.total === 0
            ? "O ChatPro não tem conversas individuais para importar."
            : `${plural(progress.inserted, "mensagem nova importada", "mensagens novas importadas")}.`}
          {progress.failed > 0
            ? ` ${plural(progress.failed, "conversa não pôde ser importada", "conversas não puderam ser importadas")}. Tente de novo para completar.`
            : ""}
        </Alert>
      ) : null}

      {progress.step === "error" ? (
        <Alert tone="danger">Não foi possível buscar as conversas no ChatPro. Tente de novo em alguns minutos.</Alert>
      ) : null}

      <div>
        <Button variant="secondary" onClick={() => void run()} loading={running}>
          {progress.step === "idle" ? "Importar mensagens" : "Importar de novo"}
        </Button>
      </div>
    </div>
  );
}
