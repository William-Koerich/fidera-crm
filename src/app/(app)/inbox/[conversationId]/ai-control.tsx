"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import { setAiPausedAction } from "./ai-control-actions";

/** Whether the AI attendant answers in this conversation, with the switch to change it. */
export function AiControl({
  conversationId,
  pausedUntil,
  teamQuietUntil,
}: {
  conversationId: string;
  /** Handed to the team, or paused by someone. */
  pausedUntil: string | null;
  /** Someone on the team wrote recently: the AI waits until then. */
  teamQuietUntil: string | null;
}) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const paused = !!pausedUntil;
  const label = paused
    ? `IA pausada até ${format(pausedUntil)}`
    : teamQuietUntil
      ? `IA esperando a equipe até ${format(teamQuietUntil)}`
      : "IA respondendo esta conversa";

  return (
    <div className="flex min-h-10 min-w-0 items-center gap-2 border-b border-border bg-brand-soft/60 px-3 text-sm sm:px-4">
      <Icon name="sparkles" className={cx("size-4 shrink-0", paused ? "text-text-muted" : "text-brand")} />
      <span className="min-w-0 flex-1 truncate">{failed ? "Não foi possível mudar. Tente de novo." : label}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await setAiPausedAction(conversationId, !paused);
            setFailed(!result.ok);
          })
        }
        className="inline-flex min-h-10 shrink-0 items-center font-medium text-info hover:underline disabled:opacity-60"
      >
        {pending ? "Salvando…" : paused ? "Devolver para a IA" : "Pausar a IA"}
      </button>
    </div>
  );
}

function format(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
