"use client";

import { KeepValuesForm } from "@/components/ui/keep-values-form";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/field";
import { MAX_BOT_OPTIONS, type BotSettings } from "@/lib/bot/config";
import type { InboxOption } from "@/lib/inbox/queries";
import { saveBotAction, type ReplyFormState } from "./actions";
import { memberName } from "@/lib/team";

/** A starting point the owner edits, not an example: it is saved as written. */
const SUGGESTED = {
  welcome: "Olá! Sou o assistente virtual do salão. Como posso ajudar?",
  handoffText: "Certo! Já vou chamar alguém da equipe para falar com você.",
  options: [
    { label: "Agendar horário", action: "book", reply: null, departmentId: null },
    { label: "Falar com a equipe", action: "handoff", reply: null, departmentId: null },
  ] as BotSettings["options"],
};

const ACTION_LABEL = { reply: "Responder com um texto", book: "Agendar um horário", handoff: "Falar com a equipe" } as const;

export function BotForm({
  settings,
  departments,
  members,
}: {
  settings: BotSettings;
  departments: InboxOption[];
  members: { id: string; email: string; name: string | null; bookable: boolean }[];
}) {
  const [state, action, pending] = useActionState<ReplyFormState, FormData>(saveBotAction, { status: "idle" });
  const welcome = settings.welcome || SUGGESTED.welcome;
  const handoffText = settings.handoffText || SUGGESTED.handoffText;
  const options = settings.options.length > 0 ? settings.options : SUGGESTED.options;
  const rows = Array.from({ length: MAX_BOT_OPTIONS }, (_, i) => options[i]);

  return (
    <KeepValuesForm action={action} className="grid gap-5">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="size-5 accent-brand" />
        Ligar o robô
      </label>

      <Field id="bot-welcome" label="Boas-vindas" hint="Enviada antes do menu, quando um cliente chama depois de 12 horas sem conversa.">
        <Textarea {...fieldA11y("bot-welcome", { hint: true })} name="welcome" defaultValue={welcome} maxLength={1000} rows={2} required />
      </Field>
      <Field id="bot-handoff" label="Ao passar para a equipe">
        <Textarea {...fieldA11y("bot-handoff")} name="handoffText" defaultValue={handoffText} maxLength={1000} rows={2} required />
      </Field>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Opções do menu, na ordem em que aparecem</legend>
        <p className="text-sm text-text-muted">
          Deixe em branco as opções que não quer usar. É obrigatório ter uma opção “Falar com a equipe”, para o cliente nunca ficar preso no robô.
        </p>
        {rows.map((option, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
            <Field id={`bot-option-${i}`} label={`Opção ${i + 1}`} optional={i > 0}>
              <Input {...fieldA11y(`bot-option-${i}`)} name={`option_${i}_label`} defaultValue={option?.label} maxLength={40} />
            </Field>
            <Field id={`bot-action-${i}`} label="O que faz">
              <Select {...fieldA11y(`bot-action-${i}`)} name={`option_${i}_action`} defaultValue={option?.action ?? "reply"}>
                {Object.entries(ACTION_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={`bot-reply-${i}`} label="Texto da resposta" hint="Só para “Responder com um texto”." className="sm:col-span-2">
              <Textarea {...fieldA11y(`bot-reply-${i}`, { hint: true })} name={`option_${i}_reply`} defaultValue={option?.reply ?? ""} maxLength={1000} rows={2} />
            </Field>
            {departments.length > 0 ? (
              <Field id={`bot-department-${i}`} label="Departamento" hint="Só para “Falar com a equipe”." className="sm:col-span-2">
                <Select {...fieldA11y(`bot-department-${i}`, { hint: true })} name={`option_${i}_department`} defaultValue={option?.departmentId ?? ""}>
                  <option value="">Nenhum</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Com quem o robô pode agendar</legend>
        <p className="mb-2 text-sm text-text-muted">Ele oferece horários dentro do horário de atendimento e da jornada de cada pessoa, sem conflito com a Agenda.</p>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {members.map((member) => (
            <li key={member.id} className="px-4">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" name="bookable" value={member.id} defaultChecked={member.bookable} className="size-5 shrink-0 accent-brand" />
                <span className="min-w-0 truncate">{memberName(member)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "saved" ? <Alert tone="success">Robô salvo.</Alert> : null}
      <div>
        <Button type="submit" loading={pending}>
          Salvar robô
        </Button>
      </div>
    </KeepValuesForm>
  );
}
