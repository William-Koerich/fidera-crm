"use client";

import { KeepValuesForm } from "@/components/ui/keep-values-form";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import type { InboxOption, MemberVisibility } from "@/lib/inbox/queries";
import { saveAccessAction, type TeamItemState } from "./actions";
import { memberName } from "@/lib/team";

const OPTIONS: { value: MemberVisibility; label: string; hint: string }[] = [
  { value: "all", label: "Todas as conversas", hint: "Toda a equipe vê tudo." },
  { value: "department", label: "As do departamento", hint: "As atribuídas à pessoa, as dos departamentos dela e as sem responsável e sem departamento." },
  { value: "own", label: "Só as próprias", hint: "As atribuídas à pessoa e as ainda sem responsável, para alguém poder assumir." },
];

export function AccessForm({
  visibility,
  members,
  departments,
}: {
  visibility: MemberVisibility;
  members: { id: string; email: string; name: string | null; departmentIds: string[] }[];
  departments: InboxOption[];
}) {
  const [state, action, pending] = useActionState<TeamItemState, FormData>(saveAccessAction, { status: "idle" });
  return (
    <KeepValuesForm action={action} className="grid gap-4">
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-medium">O que os membros veem</legend>
        {OPTIONS.map((option) => (
          <label key={option.value} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5 text-sm">
            <input type="radio" name="visibility" value={option.value} defaultChecked={visibility === option.value} className="mt-0.5 size-5 shrink-0 accent-brand" />
            <span>
              <span className="font-medium">{option.label}</span>
              <span className="block text-text-muted">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {members.length > 0 && departments.length > 0 ? (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Departamentos de cada membro</legend>
          <p className="mb-2 text-sm text-text-muted">Só faz diferença na opção “As do departamento”.</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {members.map((member) => (
              <li key={member.id} className="grid gap-1 px-4 py-2">
                <p className="truncate text-sm font-medium">{memberName(member)}</p>
                <div className="flex flex-wrap gap-x-4">
                  {departments.map((department) => (
                    <label key={department.id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={`departments_${member.id}`}
                        value={department.id}
                        defaultChecked={member.departmentIds.includes(department.id)}
                        className="size-5 shrink-0 accent-brand"
                      />
                      {department.name}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "saved" ? <Alert tone="success">Permissões salvas.</Alert> : null}
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          Salvar permissões
        </Button>
      </div>
    </KeepValuesForm>
  );
}
