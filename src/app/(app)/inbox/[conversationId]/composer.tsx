"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import { Alert } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";
import { ATTACHMENT_ACCEPT, attachmentProblem } from "@/lib/inbox/attachments";
import { filterQuickReplies, slashQuery, type QuickReply } from "@/lib/replies/quick-replies";
import { getBrowserClient } from "@/lib/supabase/client";
import { prepareAttachmentAction, sendAttachmentAction, sendReplyAction, type ComposerState } from "../actions";

const LIST_ID = "composer-quick-replies";
/** Same bucket as MEDIA_BUCKET, which is server-only. */
const MEDIA_BUCKET = "crm-media";
const FILE_PROBLEMS = {
  unsupported: "Este tipo de arquivo não é aceito. Envie imagem, áudio, vídeo MP4, PDF, Word, Excel ou texto.",
  too_large: "O arquivo passa de 16 MB. Escolha um menor.",
  empty: "Este arquivo está vazio.",
};

export function Composer({
  conversationId,
  quickReplies,
  canSendFiles,
}: {
  conversationId: string;
  quickReplies: QuickReply[];
  canSendFiles: boolean;
}) {
  const [state, action, pending] = useActionState<ComposerState, FormData>(sendReplyAction, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sendingFile, startSendingFile] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = pending || sendingFile;

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

  function pickFile(picked: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!picked) return;
    const problem = attachmentProblem(picked.type, picked.size);
    setFile(problem ? null : picked);
    setFileError(problem ? FILE_PROBLEMS[problem] : null);
    inputRef.current?.focus();
  }

  function submitFile(chosen: File) {
    setFileError(null);
    startSendingFile(async () => {
      try {
        const upload = await prepareAttachmentAction(conversationId, { mimeType: chosen.type, size: chosen.size });
        if (upload.status === "error") {
          setFileError(upload.message);
          return;
        }
        const { error } = await getBrowserClient()
          .storage.from(MEDIA_BUCKET)
          .uploadToSignedUrl(upload.path, upload.token, chosen, { contentType: chosen.type });
        if (error) {
          setFileError("Não foi possível enviar o arquivo. Tente de novo.");
          return;
        }
        const result = await sendAttachmentAction({ conversationId, path: upload.path, caption: text });
        if (result.status === "error") {
          setFileError(result.message ?? "O envio falhou. Tente de novo.");
          return;
        }
        setFile(null);
        setText("");
        inputRef.current?.focus();
      } catch {
        setFileError("O envio falhou. Tente de novo.");
      }
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (!file) return;
    e.preventDefault();
    submitFile(file);
  }

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
    <form ref={formRef} action={action} onSubmit={onSubmit} className="grid gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {fileError ? <Alert tone="danger">{fileError}</Alert> : null}
      {file ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background py-1 pr-1 pl-3">
          <Icon name="paperclip" className="size-4 shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            disabled={busy}
            aria-label={`Remover o arquivo ${file.name}`}
            className="grid size-11 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-surface hover:text-text sm:size-9"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>
      ) : null}
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
        <div className="flex items-end gap-1 rounded-2xl border border-border bg-surface p-1.5 pl-3.5 shadow-xs focus-within:border-info focus-within:ring-3 focus-within:ring-info/15">
          {canSendFiles ? (
            <>
              <input
                ref={fileRef}
                id="composer-file"
                type="file"
                accept={ATTACHMENT_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                aria-label="Anexar arquivo"
                className="-ml-2.5 grid size-11 shrink-0 place-items-center rounded-xl text-text-muted transition-colors hover:bg-background hover:text-text disabled:opacity-60 sm:size-10"
              >
                <Icon name="paperclip" className="size-[18px]" />
              </button>
            </>
          ) : null}
          <label htmlFor="composer-body" className="sr-only">
            Mensagem
          </label>
          <textarea
            id="composer-body"
            ref={inputRef}
            name="body"
            rows={1}
            maxLength={4096}
            required={!file}
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
            placeholder={file ? "Escreva uma legenda (opcional)" : "Escreva uma resposta"}
            aria-describedby="composer-hint"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-base text-text [field-sizing:content] placeholder:text-text-muted/70 focus:outline-none sm:text-sm"
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            disabled={busy}
            aria-label={file ? "Enviar arquivo" : "Enviar mensagem"}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-60 sm:size-10"
          >
            {busy ? <Spinner className="size-4" /> : <Icon name="send" className="size-[18px]" />}
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
