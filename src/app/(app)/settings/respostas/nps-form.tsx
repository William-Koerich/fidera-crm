"use client";

import { KeepValuesForm } from "@/components/ui/keep-values-form";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Textarea, fieldA11y } from "@/components/ui/field";
import { saveNpsAction, type ReplyFormState } from "./actions";

export function NpsForm({ enabled, question, thanks }: { enabled: boolean; question: string; thanks: string }) {
  const [state, action, pending] = useActionState<ReplyFormState, FormData>(saveNpsAction, { status: "idle" });
  return (
    <KeepValuesForm action={action} className="grid gap-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-5 accent-brand" />
        Pedir avaliação ao finalizar uma conversa
      </label>
      <Field id="nps-question" label="Pergunta" hint="Peça uma nota de 0 a 10. Só um número sozinho, em até 24 horas, conta como avaliação.">
        <Textarea
          {...fieldA11y("nps-question", { hint: true })}
          name="question"
          defaultValue={question}
          maxLength={1000}
          rows={2}
          placeholder="De 0 a 10, o quanto você recomendaria nosso atendimento? Responda só com o número."
        />
      </Field>
      <Field id="nps-thanks" label="Agradecimento" hint="Enviado depois da nota.">
        <Textarea
          {...fieldA11y("nps-thanks", { hint: true })}
          name="thanks"
          defaultValue={thanks}
          maxLength={1000}
          rows={2}
          placeholder="Obrigado pela sua avaliação!"
        />
      </Field>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "saved" ? <Alert tone="success">Avaliação salva.</Alert> : null}
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          Salvar avaliação
        </Button>
      </div>
    </KeepValuesForm>
  );
}
