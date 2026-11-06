"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { saveDistributionAction, type TeamItemState } from "./actions";

export function DistributionForm({
  enabled,
  members,
}: {
  enabled: boolean;
  members: { id: string; email: string; acceptsConversations: boolean }[];
}) {
  const [state, action, pending] = useActionState<TeamItemState, FormData>(saveDistributionAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-5 accent-brand" />
        Distribuir novas conversas automaticamente
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Quem recebe conversas</legend>
        <p className="mb-2 text-sm text-text-muted">
          Cada conversa sem responsável vai para quem está há mais tempo sem receber. Cliente com dono vai direto para o dono.
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
                <span className="min-w-0 truncate">{member.email}</span>
              </label>
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
    </form>
  );
}
