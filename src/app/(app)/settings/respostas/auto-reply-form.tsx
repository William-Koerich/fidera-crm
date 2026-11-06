"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Textarea, fieldA11y } from "@/components/ui/field";
import { WEEKDAYS, type AutoReplySettings } from "@/lib/replies/auto-reply";
import { saveAutoRepliesAction, type ReplyFormState } from "./actions";

/** Suggested when nothing was saved yet. Nothing is sent until an option is turned on. */
const DEFAULT_DAYS = new Set([1, 2, 3, 4, 5, 6]);
const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "18:00";

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
  const hasHours = Object.keys(settings.businessHours).length > 0;

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
          <ul className="divide-y divide-border">
            {WEEKDAYS.map((day, index) => {
              const hours = settings.businessHours[String(index)];
              return (
                <li key={day} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <label className="flex min-h-11 w-28 cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name={`day_${index}_enabled`}
                      defaultChecked={hasHours ? !!hours : DEFAULT_DAYS.has(index)}
                      className="size-5 accent-brand"
                    />
                    {day}
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      name={`day_${index}_open`}
                      aria-label={`${day}: abre às`}
                      defaultValue={hours?.open ?? DEFAULT_OPEN}
                      className="w-32"
                    />
                    <span className="text-sm text-text-muted">às</span>
                    <Input
                      type="time"
                      name={`day_${index}_close`}
                      aria-label={`${day}: fecha às`}
                      defaultValue={hours?.close ?? DEFAULT_CLOSE}
                      className="w-32"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
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
