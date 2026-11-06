"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { BusinessHoursFields } from "@/components/business-hours-fields";
import { Field, Textarea, fieldA11y } from "@/components/ui/field";
import type { AutoReplySettings } from "@/lib/replies/auto-reply";
import { saveAutoRepliesAction, type ReplyFormState } from "./actions";

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-5 accent-brand" />
      {label}
    </label>
  );
}

export function AutoReplyForm({ settings }: { settings: AutoReplySettings }) {
  const [state, action, pending] = useActionState<ReplyFormState, FormData>(saveAutoRepliesAction, { status: "idle" });

  return (
    <form action={action} className="grid gap-6">
      <fieldset className="grid gap-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Saudação</legend>
        <Toggle name="greeting_enabled" label="Responder o primeiro contato" defaultChecked={settings.greetingEnabled} />
        <p className="text-sm text-text-muted">
          Vale para quem ainda não tem conversa no Fidera. Quem já fala com você também conta como novo se a conversa não foi
          importada: use Importar mensagens em Canais antes de ligar.
        </p>
        <Field id="greeting-text" label="Texto da saudação">
          <Textarea {...fieldA11y("greeting-text")} name="greeting_text" defaultValue={settings.greetingText} maxLength={4096} rows={3} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Fora do horário</legend>
        <Toggle name="away_enabled" label="Avisar quando estiver fechado" defaultChecked={settings.awayEnabled} />
        <p className="text-sm text-text-muted">Enviado no máximo uma vez a cada 12 horas por conversa.</p>
        <Field id="away-text" label="Texto para fora do horário">
          <Textarea {...fieldA11y("away-text")} name="away_text" defaultValue={settings.awayText} maxLength={4096} rows={3} />
        </Field>

        <div className="grid gap-1">
          <p className="text-sm font-medium">Horário de atendimento (horário de Brasília)</p>
          <BusinessHoursFields hours={settings.businessHours} />
        </div>
      </fieldset>

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "saved" ? <Alert tone="success">Respostas automáticas salvas.</Alert> : null}
      <div>
        <Button type="submit" loading={pending}>
          Salvar respostas automáticas
        </Button>
      </div>
    </form>
  );
}
