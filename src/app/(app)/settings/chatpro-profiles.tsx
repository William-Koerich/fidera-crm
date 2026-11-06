"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { listContactsForProfileSyncAction, syncContactProfileAction } from "./channel-actions";

const PAUSE_MS = 500;
const RATE_LIMIT_WAIT_MS = 20_000;
const MAX_ATTEMPTS = 4;

type Progress =
  | { step: "idle" }
  | { step: "running"; done: number; total: number }
  | { step: "finished"; total: number; failed: number }
  | { step: "error" };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Brings names and photos for contacts already in the CRM. New ones update by themselves. */
export function ChatProProfiles() {
  const [progress, setProgress] = useState<Progress>({ step: "idle" });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  async function run() {
    setProgress({ step: "running", done: 0, total: 0 });
    const contacts = await listContactsForProfileSyncAction().catch(() => null);
    if (cancelled.current) return;
    if (!contacts) {
      setProgress({ step: "error" });
      return;
    }

    let failed = 0;
    for (const [done, contactId] of contacts.entries()) {
      if (cancelled.current) return;
      setProgress({ step: "running", done, total: contacts.length });
      let status = "error";
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !cancelled.current; attempt += 1) {
        status = await syncContactProfileAction(contactId).catch(() => "error");
        if (status !== "rate_limited") break;
        await wait(RATE_LIMIT_WAIT_MS);
      }
      if (status !== "ok") failed += 1;
      await wait(PAUSE_MS);
    }
    if (!cancelled.current) setProgress({ step: "finished", total: contacts.length, failed });
  }

  const running = progress.step === "running";

  return (
    <div className="grid gap-3 rounded-lg border border-border p-4">
      <div>
        <p className="text-sm font-medium">Nomes e fotos dos contatos</p>
        <p className="mt-1 text-sm text-text-muted">
          Usa o nome salvo na agenda do celular e a foto do perfil. Contatos novos são atualizados sozinhos quando mandam
          mensagem. Quem esconde a foto ou fala por um número oculto pode continuar sem nome ou foto.
        </p>
      </div>

      {progress.step === "running" ? (
        <p role="status" className="text-sm text-text-muted">
          {progress.total === 0
            ? "Buscando contatos…"
            : `Atualizando contato ${progress.done + 1} de ${progress.total}. Mantenha esta página aberta.`}
        </p>
      ) : null}
      {progress.step === "finished" ? (
        <Alert tone={progress.failed > 0 ? "warning" : "success"}>
          {progress.failed > 0
            ? `${progress.total - progress.failed} de ${progress.total} contatos consultados. Tente de novo para completar.`
            : `${progress.total === 1 ? "1 contato consultado" : `${progress.total} contatos consultados`}.`}
        </Alert>
      ) : null}
      {progress.step === "error" ? <Alert tone="danger">Não foi possível buscar os contatos. Tente de novo.</Alert> : null}

      <div>
        <Button variant="secondary" onClick={() => void run()} loading={running}>
          Atualizar nomes e fotos
        </Button>
      </div>
    </div>
  );
}
