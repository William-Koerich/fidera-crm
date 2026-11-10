"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Select, Textarea, fieldA11y } from "@/components/ui/field";
import { KeepValuesForm } from "@/components/ui/keep-values-form";
import { DEFAULT_INSTRUCTIONS, MAX_INSTRUCTIONS_CHARS, PAUSE_OPTIONS_HOURS, type AgentSettings } from "@/lib/ai/agent/config";
import { saveAgentAction, type AgentFormState } from "./actions";

const hours = (h: number) => (h === 1 ? "1 hora" : h < 24 || h % 24 ? `${h} horas` : h === 24 ? "1 dia" : `${h / 24} dias`);

export function AgentForm({ settings, departments }: { settings: AgentSettings; departments: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<AgentFormState, FormData>(saveAgentAction, { status: "idle" });
  return (
    <KeepValuesForm action={action} className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-semibold">
        <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="size-5 accent-brand" />
        Deixar a IA responder os clientes
      </label>

      <Field
        id="agent-instructions"
        label="Instruções para a IA"
        hint={
          <>
            Escreva como para uma pessoa nova na recepção: nome, tom, endereço, preços, regras da casa e quando chamar a equipe. Os
            serviços, o horário de funcionamento e a agenda ela já consulta sozinha. Até {MAX_INSTRUCTIONS_CHARS} letras.
          </>
        }
      >
        <Textarea
          {...fieldA11y("agent-instructions", { hint: true })}
          name="instructions"
          defaultValue={settings.instructions || DEFAULT_INSTRUCTIONS}
          maxLength={MAX_INSTRUCTIONS_CHARS}
          rows={16}
          className="font-mono text-sm leading-relaxed"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="agent-mode" label="Quando a IA responde">
          <Select id="agent-mode" name="mode" defaultValue={settings.mode}>
            <option value="always">Sempre</option>
            <option value="outside_hours">Só fora do horário de atendimento</option>
          </Select>
        </Field>
        <Field id="agent-pause" label="Depois que alguém da equipe escreve, a IA fica quieta por">
          <Select id="agent-pause" name="pauseAfterTeamHours" defaultValue={String(settings.pauseAfterTeamHours)}>
            {PAUSE_OPTIONS_HOURS.map((h) => (
              <option key={h} value={h}>
                {hours(h)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="grid min-w-0 gap-1">
        <legend className="mb-1 text-sm font-medium">O que a IA pode fazer</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" name="canBook" defaultChecked={settings.canBook} className="size-5 accent-brand" />
          Agendar na Agenda, depois de o cliente confirmar serviço, dia e horário
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" name="canCancel" defaultChecked={settings.canCancel} className="size-5 accent-brand" />
          Cancelar e remarcar agendamentos do próprio cliente
        </label>
        <p className="text-sm text-text-muted">Consultar horários livres e chamar a equipe ela sempre pode.</p>
      </fieldset>

      <Field id="agent-department" label="Quando a IA chamar a equipe, mandar para" optional>
        <Select id="agent-department" name="handoffDepartmentId" defaultValue={settings.handoffDepartmentId ?? ""}>
          <option value="">Deixar sem departamento</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "saved" ? <Alert tone="success">Atendente com IA salvo.</Alert> : null}
      <div>
        <Button type="submit" loading={pending}>
          Salvar
        </Button>
      </div>
    </KeepValuesForm>
  );
}
