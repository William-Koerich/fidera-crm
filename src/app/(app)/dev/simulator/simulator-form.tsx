"use client";

import { useActionState } from "react";
import { Alert, Button, Input } from "@/components/ui";
import { simulateAction, type SimulatorState } from "./actions";

export function SimulatorForm() {
  const [state, action, pending] = useActionState<SimulatorState, FormData>(simulateAction, { status: "idle" });

  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-medium text-text">
        Nome do contato
        <Input name="name" defaultValue="Ana Souza" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-text">
        Telefone
        <Input name="phone" defaultValue="+55 48 99999-0000" inputMode="tel" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-text">
        Mensagem
        <Input name="body" defaultValue="Oi! Tem horário amanhã à tarde?" />
      </label>

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

      <Button type="submit" name="kind" value="inbound" disabled={pending}>
        Cliente envia mensagem
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" name="kind" value="echo" variant="secondary" disabled={pending}>
          Dono responde pelo celular
        </Button>
        <Button type="submit" name="kind" value="read" variant="secondary" disabled={pending}>
          Cliente lê a última enviada
        </Button>
        <Button type="submit" name="kind" value="history" variant="secondary" disabled={pending}>
          Importar histórico
        </Button>
        <Button type="submit" name="kind" value="partner_removed" variant="secondary" disabled={pending}>
          Simular desconexão
        </Button>
      </div>
    </form>
  );
}
