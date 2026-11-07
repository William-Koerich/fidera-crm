"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { summarizeAction } from "../ai-actions";
import { addNoteAction } from "../team-actions";

/** A summary for whoever takes over, made on request and kept only if saved as a note. */
export function ConversationSummary({ conversationId }: { conversationId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-2">
      <div>
        <Button
          variant="secondary"
          size="sm"
          loading={pending && !summary}
          onClick={() =>
            startTransition(async () => {
              setMessage(null);
              const result = await summarizeAction(conversationId).catch(() => null);
              if (result?.ok) setSummary(result.text);
              else setMessage(result?.message ?? "A IA não respondeu agora. Tente de novo em instantes.");
            })
          }
        >
          Resumir conversa com IA
        </Button>
      </div>
      {summary ? (
        <div className="grid gap-2 rounded-lg border border-border bg-background p-3">
          <p className="text-xs font-medium text-text-muted">Resumo feito pela IA. Confira antes de usar.</p>
          <p className="whitespace-pre-wrap text-sm">{summary}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await addNoteAction(conversationId, summary).catch(() => null);
                  if (result?.status === "saved") {
                    setSummary(null);
                    setMessage("Resumo salvo como nota interna.");
                  } else setMessage(result?.notice ?? "Não foi possível salvar a nota.");
                })
              }
            >
              Salvar como nota
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSummary(null)}>
              Descartar
            </Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-text-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
