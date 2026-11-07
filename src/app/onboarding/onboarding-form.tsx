"use client";

import { KeepValuesForm } from "@/components/ui/keep-values-form";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, fieldA11y } from "@/components/ui/field";
import { createOrganizationAction, type FormState } from "../(app)/org-actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrganizationAction, { status: "idle" });
  const error = state.status === "error" ? state.message : undefined;
  return (
    <KeepValuesForm action={action} className="grid gap-4">
      <Field id="org-name" label="Nome do negócio" error={error}>
        <Input
          {...fieldA11y("org-name", { error })}
          name="name"
          placeholder="Ex.: Studio Bella, Barbearia Central"
          autoComplete="organization"
          minLength={2}
          maxLength={120}
          required
        />
      </Field>
      <Button type="submit" block loading={pending}>
        Continuar
      </Button>
      <p className="text-sm text-text-muted">
        No próximo passo você conecta o número de WhatsApp do negócio.
      </p>
    </KeepValuesForm>
  );
}
