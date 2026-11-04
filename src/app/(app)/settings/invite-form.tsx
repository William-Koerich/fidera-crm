"use client";

import { useActionState } from "react";
import { Button, Input, Label, Notice } from "@/components/ui";
import { inviteMemberAction, type FormState } from "../org-actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteMemberAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-3">
      <Label>
        E-mail
        <Input name="email" type="email" required />
      </Label>
      <Label>
        Papel
        <select
          name="role"
          defaultValue="member"
          className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="member">Membro: atende conversas</option>
          <option value="admin">Administrador: também gerencia equipe e canais</option>
        </select>
      </Label>
      {state.status === "error" ? <Notice tone="error">{state.message}</Notice> : null}
      {state.status === "success" ? (
        <div className="grid gap-2">
          <Notice tone="success">{state.message}</Notice>
          <Input readOnly value={state.inviteLink} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Criando..." : "Criar convite"}
      </Button>
    </form>
  );
}
