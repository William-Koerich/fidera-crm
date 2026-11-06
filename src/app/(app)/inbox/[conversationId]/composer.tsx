"use client";

import { useActionState, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import { Alert } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";
import { filterQuickReplies, slashQuery, type QuickReply } from "@/lib/replies/quick-replies";
import { sendReplyAction, type ComposerState } from "../actions";

const LIST_ID = "composer-quick-replies";

export function Composer({ conversationId, quickReplies }: { conversationId: string; quickReplies: QuickReply[] }) {
  const [state, action, pending] = useActionState<ComposerState, FormData>(sendReplyAction, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const query = slashQuery(text);
  const matches = query === null || dismissed ? [] : filterQuickReplies(quickReplies, query);
  const open = matches.length > 0;
  const active = Math.min(highlight, matches.length - 1);

  // Clears during render, as React recommends for state derived from a change.
  const [clearedFor, setClearedFor] = useState(state.sentAt);
  if (state.sentAt !== clearedFor) {
    setClearedFor(state.sentAt);
    setText("");
  }

  useEffect(() => {
    if (state.status === "sent") inputRef.current?.focus();
  }, [state.sentAt, state.status]);

  function choose(reply: QuickReply) {
    setText(reply.body);
    setDismissed(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      formRef.current?.requestSubmit();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((active + step + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(matches[active]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(true);
    }
  }

  return (
    <form ref={formRef} action={action} className="grid gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="relative">
        {open ? (
          <ul
            id={LIST_ID}
            role="listbox"
            aria-label="Respostas rápidas"
            className="absolute right-0 bottom-full left-0 z-10 mb-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
          >
            {matches.map((r, i) => (
              <li
                key={r.id}
                id={`${LIST_ID}-${r.id}`}
                role="option"
                aria-selected={i === active}
                // Keeps focus in the textarea, so typing can continue after the click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
                className={cx(
                  "flex min-h-11 cursor-pointer flex-col justify-center rounded-lg px-3 py-1.5",
                  i === active && "bg-background",
                )}
              >
                <span className="text-sm font-medium">/{r.shortcut}</span>
                <span className="truncate text-xs text-text-muted">{r.body}</span>
              </li>
            ))}
          </ul>
        ) : null}
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
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setHighlight(0);
              setDismissed(false);
            }}
            role="combobox"
            aria-expanded={open}
            aria-controls={LIST_ID}
            aria-autocomplete="list"
            aria-activedescendant={open ? `${LIST_ID}-${matches[active]!.id}` : undefined}
            placeholder="Escreva uma resposta"
            aria-describedby="composer-hint"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-base text-text [field-sizing:content] placeholder:text-text-muted/70 focus:outline-none sm:text-sm"
            onKeyDown={onKeyDown}
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
      </div>
      <p id="composer-hint" className="hidden px-1 text-xs text-text-muted sm:block">
        Ctrl + Enter para enviar.{quickReplies.length > 0 ? " Digite / para respostas rápidas." : ""} A mensagem sai pelo
        número conectado.
      </p>
    </form>
  );
}
