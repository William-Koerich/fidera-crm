"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, fieldA11y } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/inputs-client";
import { inviteMemberAction, type FormState } from "../org-actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteMemberAction, { status: "idle" });
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <Field id="invite-email" label="E-mail da pessoa">
          <Input {...fieldA11y("invite-email")} name="email" type="email" autoComplete="off" required />
        </Field>
        <Field id="invite-role" label="Papel">
          <Select {...fieldA11y("invite-role")} name="role" defaultValue="member">
            <option value="member">Membro</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>
        <Button type="submit" loading={pending}>
          Criar convite
        </Button>
      </form>

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "success" && state.inviteLink ? (
        <div className="grid gap-3 rounded-lg border border-success/20 bg-success/5 p-4">
          <p className="text-sm text-text">
            <span className="font-medium text-success">Convite criado.</span> Envie este link para a pessoa. Ele vale por 7
            dias e só pode ser usado uma vez, com o e-mail convidado.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="invite-link" className="sr-only">
              Link do convite
            </label>
            <Input id="invite-link" readOnly value={state.inviteLink} onFocus={(e) => e.currentTarget.select()} />
            <CopyButton value={state.inviteLink} label="Copiar link" className="shrink-0" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
