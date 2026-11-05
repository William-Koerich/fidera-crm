"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, fieldA11y } from "@/components/ui/field";
import { simulateAction, type SimulatorState } from "./actions";

export function SimulatorForm() {
  const [state, action, pending] = useActionState<SimulatorState, FormData>(simulateAction, { status: "idle" });

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sim-name" label="Nome do contato">
          <Input {...fieldA11y("sim-name")} name="name" defaultValue="Cliente teste" />
        </Field>
        <Field id="sim-phone" label="Telefone" hint="Brasil, com DDD.">
          <Input {...fieldA11y("sim-phone", { hint: true })} name="phone" defaultValue="+55 48 99999-0000" inputMode="tel" />
        </Field>
        <Field id="sim-body" label="Mensagem" className="sm:col-span-2">
          <Input {...fieldA11y("sim-body")} name="body" defaultValue="Oi! Tem horário amanhã à tarde?" />
        </Field>
      </div>

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="grid gap-2">
        <Button type="submit" name="kind" value="inbound" loading={pending}>
          Cliente envia mensagem
        </Button>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="submit" name="kind" value="echo" variant="secondary" disabled={pending}>
            Dono responde pelo celular
          </Button>
          <Button type="submit" name="kind" value="read" variant="secondary" disabled={pending}>
            Cliente lê a última enviada
          </Button>
          <Button type="submit" name="kind" value="history" variant="secondary" disabled={pending}>
            Importar histórico
          </Button>
          <Button type="submit" name="kind" value="partner_removed" variant="danger-ghost" disabled={pending}>
            Simular desconexão
          </Button>
        </div>
      </div>
    </form>
  );
}
