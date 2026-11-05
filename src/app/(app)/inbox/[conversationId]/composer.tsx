"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Notice } from "@/components/ui";
import { sendReplyAction, type ComposerState } from "../actions";

export function Composer({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState<ComposerState, FormData>(sendReplyAction, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "sent") formRef.current?.reset();
  }, [state.sentAt, state.status]);

  return (
    <form ref={formRef} action={action} className="grid gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      {state.status === "error" ? <Notice tone="error">{state.message}</Notice> : null}
      <div className="flex items-end gap-2">
        <textarea
          name="body"
          rows={1}
          maxLength={4096}
          required
          placeholder="Escreva uma resposta"
          aria-label="Mensagem"
          className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-info focus:ring-2 focus:ring-info/20"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) formRef.current?.requestSubmit();
          }}
        />
        <Button type="submit" disabled={pending}>
          {pending ? "..." : "Enviar"}
        </Button>
      </div>
    </form>
  );
}
