"use client";

import { useActionState, useState } from "react";
import { Alert, Button } from "@/components/ui";
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
    <div className="grid gap-3">
      {!hasActive ? (
        <div className="grid gap-2 rounded-xl bg-info-soft p-3 text-sm text-info">
          <p className="font-medium">Antes de conectar o seu WhatsApp Business</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Você continua usando o WhatsApp Business no celular normalmente.</li>
            <li>Listas de transmissão ficam desativadas no app enquanto o número estiver conectado.</li>
            <li>Grupos não são sincronizados com a inbox.</li>
            <li>Mensagens enviadas pelo celular aparecem aqui automaticamente.</li>
          </ul>
          <label className="mt-1 flex items-center gap-2 text-text">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            Entendi e quero conectar
          </label>
        </div>
      ) : null}

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

      {!hasActive ? (
        <form action={start}>
          <Button type="submit" className="w-full" disabled={!accepted || starting}>
            {starting ? "Abrindo..." : hasPending ? "Continuar conexão" : "Conectar WhatsApp Business"}
          </Button>
        </form>
      ) : null}

      {hasPending || hasActive ? (
        <form action={check}>
          <Button type="submit" variant="secondary" className="w-full" disabled={checking}>
            {checking ? "Verificando..." : hasActive ? "Verificar conexão" : "Já conectei, verificar"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
