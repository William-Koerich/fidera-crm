"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, fieldA11y } from "@/components/ui/field";
import type { TeamItemKind } from "@/lib/replies/team-items";
import { createTeamItemAction, importTeamItemsAction, type TeamItemState } from "./actions";

export function TeamItemForm({ kind, label, withColor }: { kind: TeamItemKind; label: string; withColor?: boolean }) {
  const [state, action, pending] = useActionState<TeamItemState, FormData>(createTeamItemAction, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "saved") formRef.current?.reset();
  }, [state.savedAt, state.status]);

  return (
    <div className="grid gap-3">
      <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="kind" value={kind} />
        <Field id={`${kind}-name`} label={label} className="flex-1">
          <Input {...fieldA11y(`${kind}-name`)} name="name" maxLength={80} autoComplete="off" required />
        </Field>
        {withColor ? (
          <Field id={`${kind}-color`} label="Cor">
            <Input {...fieldA11y(`${kind}-color`)} type="color" name="color" defaultValue="#6d28d9" className="w-full p-1 sm:w-16" />
          </Field>
        ) : null}
        <Button type="submit" variant="secondary" loading={pending}>
          Adicionar
        </Button>
      </form>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "saved" && state.message ? <Alert tone="warning">{state.message}</Alert> : null}
    </div>
  );
}

export function ImportFromChannel({ kind }: { kind: "endings" | "departments" }) {
  const [state, action, pending] = useActionState<TeamItemState, FormData>(importTeamItemsAction, { status: "idle" });
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="kind" value={kind} />
      <div>
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          Trazer do ChatPro
        </Button>
      </div>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "saved" && state.message ? <Alert tone="success">{state.message}</Alert> : null}
    </form>
  );
}
