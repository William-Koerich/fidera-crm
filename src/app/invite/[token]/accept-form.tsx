"use client";

import { useActionState } from "react";
import { Alert, Button } from "@/components/ui";
import { acceptInvitationAction, type FormState } from "../../(app)/org-actions";

export function AcceptInviteForm({ token, email }: { token: string; email: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvitationAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-text-muted">Você está entrando como {email ?? "usuário"}.</p>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Aceitar convite"}
      </Button>
    </form>
  );
}
