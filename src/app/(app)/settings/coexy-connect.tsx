"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { refreshCoexyChannelAction, startCoexyConnectionAction, type ChannelActionState } from "./channel-actions";

export function CoexyConnect({ hasPending, hasActive }: { hasPending: boolean; hasActive: boolean }) {
  const [accepted, setAccepted] = useState(false);
  const [startState, start, starting] = useActionState<ChannelActionState, FormData>(startCoexyConnectionAction, {
    status: "idle",
  });
  const [checkState, check, checking] = useActionState<ChannelActionState, FormData>(refreshCoexyChannelAction, {
    status: "idle",
  });
  const state = checkState.status !== "idle" ? checkState : startState;

  return (
    <div className="grid gap-4">
      {!hasActive ? (
        <div className="grid gap-3 rounded-lg border border-border bg-background p-4 text-sm">
          <p className="font-medium text-text">O que muda ao conectar o seu WhatsApp Business</p>
          <ul className="grid gap-1.5 text-text-muted">
            <li>• Você continua usando o WhatsApp Business no celular normalmente.</li>
            <li>• Mensagens enviadas pelo celular também aparecem aqui.</li>
            <li>• Listas de transmissão ficam desativadas no app enquanto o número estiver conectado.</li>
            <li>• Grupos não são sincronizados com a inbox.</li>
          </ul>
          <label className="flex min-h-11 items-center gap-3 text-text">
            <input
              type="checkbox"
              className="size-5 rounded border-border accent-[var(--color-brand)]"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            Entendi e quero conectar
          </label>
        </div>
      ) : null}

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        {!hasActive ? (
          <form action={start}>
            <Button type="submit" block disabled={!accepted} loading={starting}>
              {hasPending ? "Continuar conexão" : "Conectar WhatsApp Business"}
            </Button>
          </form>
        ) : null}
        {hasPending || hasActive ? (
          <form action={check}>
            <Button type="submit" variant="secondary" block loading={checking}>
              {hasActive ? "Verificar conexão" : "Já conectei, verificar"}
            </Button>
          </form>
        ) : null}
      </div>
      {hasPending && !hasActive ? (
        <p className="text-sm text-text-muted">
          Terminou a conexão na página do Coexy? Volte aqui e toque em “Já conectei, verificar”.
        </p>
      ) : null}
    </div>
  );
}
