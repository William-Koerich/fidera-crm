"use client";

import { useActionState } from "react";
import { Alert, Button, Input } from "@/components/ui";
import { createOrganizationAction, type FormState } from "../(app)/org-actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrganizationAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-1.5 text-sm font-medium text-text">
        Nome do negócio
        <Input name="name" placeholder="Ex.: Barbearia do Zé" minLength={2} maxLength={120} required />
      </label>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Criando..." : "Continuar"}
      </Button>
    </form>
  );
}
