"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, fieldA11y } from "@/components/ui/field";
import { DURATIONS, durationLabel } from "@/lib/agenda/form";
import { saveServiceAction, type TeamItemState } from "./actions";

export function ServiceForm() {
  const [state, action, pending] = useActionState<TeamItemState, FormData>(saveServiceAction, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "saved") formRef.current?.reset();
  }, [state.savedAt, state.status]);

  return (
    <div className="grid gap-3">
      <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field id="service-name" label="Serviço" hint="Salve com o mesmo nome para mudar a duração." className="flex-1">
          <Input {...fieldA11y("service-name", { hint: true })} name="name" maxLength={120} autoComplete="off" required />
        </Field>
        <Field id="service-duration" label="Duração" hint=" ">
          <Select {...fieldA11y("service-duration")} name="duration" defaultValue="30">
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {durationLabel(minutes)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:mb-7">
          <Button type="submit" variant="secondary" loading={pending}>
            Salvar
          </Button>
        </div>
      </form>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
    </div>
  );
}
