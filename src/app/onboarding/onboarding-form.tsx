"use client";

import { useActionState } from "react";
import { Button, Input, Label, Notice } from "@/components/ui";
import { createOrganizationAction, type FormState } from "../(app)/org-actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrganizationAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-4">
      <Label>
        Nome do negócio
        <Input name="name" placeholder="Ex.: Barbearia do Zé" minLength={2} maxLength={120} required />
      </Label>
      {state.status === "error" ? <Notice tone="error">{state.message}</Notice> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Criando..." : "Continuar"}
      </Button>
    </form>
  );
}
