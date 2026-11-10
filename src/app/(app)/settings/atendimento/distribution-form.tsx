"use client";

import { KeepValuesForm } from "@/components/ui/keep-values-form";
import { useActionState } from "react";
import { BusinessHoursFields } from "@/components/business-hours-fields";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import type { BusinessHours } from "@/lib/replies/auto-reply";
import { saveDistributionAction, type TeamItemState } from "./actions";
import { memberName } from "@/lib/team";

export function DistributionForm({
  enabled,
  members,
}: {
  enabled: boolean;
  members: { id: string; email: string; name: string | null; acceptsConversations: boolean; workHours: BusinessHours | null }[];
}) {
  const [state, action, pending] = useActionState<TeamItemState, FormData>(saveDistributionAction, { status: "idle" });
  return (
    <KeepValuesForm action={action} className="grid gap-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-5 accent-brand" />
        Distribuir novas conversas automaticamente
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Quem recebe conversas</legend>
        <p className="mb-2 text-sm text-text-muted">
          Cada conversa sem responsável vai para quem está há mais tempo sem receber e dentro do horário. Cliente com dono vai
          direto para o dono, mesmo fora do horário. O horário vale só no Fidera: não muda a jornada no ChatPro nem bloqueia o
          acesso de ninguém.
        </p>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {members.map((member) => (
            <li key={member.id} className="px-4">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="members"
                  value={member.id}
                  defaultChecked={member.acceptsConversations}
                  className="size-5 shrink-0 accent-brand"
                />
                <span className="min-w-0 truncate">{memberName(member)}</span>
              </label>
              <details className="pb-2">
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-info sm:min-h-0">
                  {member.workHours ? "Horário definido" : "Sem horário definido"}
                </summary>
                <div className="mt-2 grid gap-1">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name={`member_${member.id}_has_hours`}
                      defaultChecked={!!member.workHours}
                      className="size-5 shrink-0 accent-brand"
                    />
                    Recebe conversas só nestes horários (horário de Brasília)
                  </label>
                  <BusinessHoursFields hours={member.workHours ?? {}} prefix={`member_${member.id}_`} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </fieldset>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "saved" ? <Alert tone="success">Distribuição salva.</Alert> : null}
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          Salvar distribuição
        </Button>
      </div>
    </KeepValuesForm>
  );
}
