"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Textarea, fieldA11y } from "@/components/ui/field";
import { MAX_REPLY_LENGTH, type QuickReply } from "@/lib/replies/quick-replies";
import { saveQuickReplyAction, type ReplyFormState } from "./actions";

/** Creates a quick reply, or edits `reply` when given. */
export function QuickReplyForm({ reply }: { reply?: QuickReply }) {
  const [state, action, pending] = useActionState<ReplyFormState, FormData>(saveQuickReplyAction, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const prefix = reply ? `reply-${reply.id}` : "reply-new";

  const isNew = !reply;
  useEffect(() => {
    if (state.status === "saved" && isNew) formRef.current?.reset();
  }, [state.savedAt, state.status, isNew]);

  return (
    <form ref={formRef} action={action} className="grid gap-4">
      {reply ? <input type="hidden" name="id" value={reply.id} /> : null}
      <Field id={`${prefix}-shortcut`} label="Atalho" hint="O que vem depois da barra na inbox. Exemplo: horario">
        <Input
          {...fieldA11y(`${prefix}-shortcut`)}
          name="shortcut"
          defaultValue={reply?.shortcut}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="none"
          required
        />
      </Field>
      <Field id={`${prefix}-body`} label="Texto">
        <Textarea
          {...fieldA11y(`${prefix}-body`)}
          name="body"
          defaultValue={reply?.body}
          maxLength={MAX_REPLY_LENGTH}
          rows={3}
          required
        />
      </Field>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "saved" && reply ? <Alert tone="success">Alterações salvas.</Alert> : null}
      <div>
        <Button type="submit" variant={reply ? "secondary" : "primary"} loading={pending}>
          {reply ? "Salvar alterações" : "Adicionar resposta"}
        </Button>
      </div>
    </form>
  );
}
