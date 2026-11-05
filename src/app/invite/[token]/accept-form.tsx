"use client";

import { useActionState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { acceptInvitationAction, type FormState } from "../../(app)/org-actions";
import { signOutAction } from "../../login/actions";

export function AcceptInviteForm({ token, email }: { token: string; email: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvitationAction, { status: "idle" });
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 rounded-lg bg-background p-3 ring-1 ring-border">
        <Avatar name={email?.split("@")[0]} size="sm" />
        <div className="min-w-0 text-sm">
          <p className="text-text-muted">Entrando como</p>
          <p className="truncate font-medium">{email ?? "sua conta"}</p>
        </div>
      </div>

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" block loading={pending}>
          Aceitar convite
        </Button>
      </form>

      <form action={signOutAction} className="text-center text-sm text-text-muted">
        O convite foi para outro e-mail?{" "}
        <button type="submit" className="inline-flex min-h-11 items-center font-medium text-info hover:underline">
          Sair e trocar de conta
        </button>
      </form>
    </div>
  );
}
