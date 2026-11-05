"use client";

import { useActionState, useEffect, useRef } from "react";
import { Icon } from "@/components/icons";
import { Alert } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";
import { sendReplyAction, type ComposerState } from "../actions";

export function Composer({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState<ComposerState, FormData>(sendReplyAction, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.status === "sent") {
      formRef.current?.reset();
      inputRef.current?.focus();
    }
  }, [state.sentAt, state.status]);

  return (
    <form ref={formRef} action={action} className="grid gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-1.5 pl-3.5 shadow-xs focus-within:border-info focus-within:ring-3 focus-within:ring-info/15">
        <label htmlFor="composer-body" className="sr-only">
          Mensagem
        </label>
        <textarea
          id="composer-body"
          ref={inputRef}
          name="body"
          rows={1}
          maxLength={4096}
          required
          placeholder="Escreva uma resposta"
          aria-describedby="composer-hint"
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-base text-text [field-sizing:content] placeholder:text-text-muted/70 focus:outline-none sm:text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) formRef.current?.requestSubmit();
          }}
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Enviar mensagem"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-60 sm:size-10"
        >
          {pending ? <Spinner className="size-4" /> : <Icon name="send" className="size-[18px]" />}
        </button>
      </div>
      <p id="composer-hint" className="hidden px-1 text-xs text-text-muted sm:block">
        Ctrl + Enter para enviar. A mensagem sai pelo número conectado, dentro da janela de 24h.
      </p>
    </form>
  );
}
