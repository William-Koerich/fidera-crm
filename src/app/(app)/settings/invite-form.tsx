"use client";

import { useActionState } from "react";
import { Alert, Button, Input, Select } from "@/components/ui";
import { inviteMemberAction, type FormState } from "../org-actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteMemberAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1.5 text-sm font-medium text-text">
        E-mail
        <Input name="email" type="email" required />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-text">
        Papel
        <Select name="role" defaultValue="member">
          <option value="member">Membro: atende conversas</option>
          <option value="admin">Administrador: também gerencia equipe e canais</option>
        </Select>
      </label>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "success" ? (
        <div className="grid gap-2">
          <Alert tone="success">{state.message}</Alert>
          <Input readOnly value={state.inviteLink} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Criando..." : "Criar convite"}
      </Button>
    </form>
  );
}
