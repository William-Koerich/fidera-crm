"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import { Alert } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/spinner";
import { ATTACHMENT_ACCEPT, attachmentProblem } from "@/lib/inbox/attachments";
import { filterQuickReplies, slashQuery, type QuickReply } from "@/lib/replies/quick-replies";
import { getBrowserClient } from "@/lib/supabase/client";
import { useBookingConfirmation } from "./schedule";
import { rewriteDraftAction, suggestReplyAction } from "../ai-actions";
import { addNoteAction } from "../team-actions";
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
  initialText = "",
  aiEnabled = false,
}: {
  /** Whether the server has the AI assistant switched on. */
  aiEnabled?: boolean;
  /** Text to start with, for the person to review, e.g. from "Chamar hoje". */
  initialText?: string;
  conversationId: string;
  quickReplies: QuickReply[];
  canSendFiles: boolean;
}) {
  const [state, action, pending] = useActionState<ComposerState, FormData>(sendReplyAction, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(initialText);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sendingFile, startSendingFile] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [noteMode, setNoteMode] = useState(false);
  const confirmation = useBookingConfirmation();
  const [aiPending, startAi] = useTransition();
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  /** The assistant only fills the box: a person reads and sends. */
  function askAi(kind: "suggest" | "rewrite") {
    setAiNotice(null);
    startAi(async () => {
      const result = await (kind === "suggest" ? suggestReplyAction(conversationId) : rewriteDraftAction(conversationId, text)).catch(() => null);
      if (!result) {
        setAiNotice("A IA não respondeu agora. Tente de novo em instantes.");
        return;
      }
      if (!result.ok) {
        setAiNotice(result.message);
        return;
      }
      setText(result.text);
      setAiNotice("Texto escrito pela IA. Revise antes de enviar.");
      inputRef.current?.focus();
    });
  }
  const busy = pending || sendingFile;

  const query = noteMode ? null : slashQuery(text);
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

  /** Only fills the box: the person reviews it and sends. Keeps anything already written. */
  function useConfirmation() {
    setNoteMode(false);
    setText((current) => (current.trim() ? `${current.trimEnd()}\n${confirmation.text}` : (confirmation.text ?? "")));
    confirmation.dismiss();
    inputRef.current?.focus();
  }

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

  function submitNote() {
    setFileError(null);
    startSendingFile(async () => {
      const result = await addNoteAction(conversationId, text).catch(() => null);
      if (!result) {
        setFileError("Não foi possível salvar a nota. Tente de novo.");
        return;
      }
      if (result.status === "error") {
        setFileError(result.notice ?? "Não foi possível salvar a nota. Tente de novo.");
        return;
      }
      setText("");
      setFileError(result.notice ?? null);
      inputRef.current?.focus();
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (noteMode) {
      e.preventDefault();
      submitNote();
    } else if (file) {
      e.preventDefault();
      submitFile(file);
    }
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
      {aiNotice ? (
        <p role="status" className="px-1 text-xs text-text-muted">
          {aiNotice}
        </p>
      ) : null}
      {confirmation.text ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-success/20 bg-success/5 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">Cliente agendado. Quer avisar pelo WhatsApp?</span>
          <button type="button" onClick={useConfirmation} className="inline-flex min-h-11 items-center font-medium text-info hover:underline sm:min-h-0">
            Escrever confirmação
          </button>
          <button type="button" onClick={confirmation.dismiss} className="inline-flex min-h-11 items-center text-text-muted hover:text-text sm:min-h-0">
            Agora não
          </button>
        </div>
      ) : null}
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
        <div
          className={cx(
            "flex items-end gap-1 rounded-2xl border p-1.5 pl-3.5 shadow-xs focus-within:ring-3",
            noteMode
              ? "border-warning/40 bg-warning/10 focus-within:border-warning focus-within:ring-warning/15"
              : "border-border bg-surface focus-within:border-info focus-within:ring-info/15",
          )}
        >
          {canSendFiles && !noteMode ? (
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
            required={!file || noteMode}
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
            placeholder={noteMode ? "Nota para a equipe. O cliente não vê." : file ? "Escreva uma legenda (opcional)" : "Escreva uma resposta"}
            aria-describedby="composer-hint"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-base text-text [field-sizing:content] placeholder:text-text-muted/70 focus:outline-none sm:text-sm"
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            disabled={busy}
            aria-label={noteMode ? "Salvar nota" : file ? "Enviar arquivo" : "Enviar mensagem"}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-60 sm:size-10"
          >
            {busy ? <Spinner className="size-4" /> : <Icon name="send" className="size-[18px]" />}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 px-1">
        <p id="composer-hint" className="hidden text-xs text-text-muted sm:block">
          {noteMode ? "Ctrl + Enter para salvar. Só a equipe vê." : `Ctrl + Enter para enviar.${quickReplies.length > 0 ? " Digite / para respostas rápidas." : ""}`}
        </p>
        {aiEnabled && !noteMode ? (
          <div className="flex flex-wrap items-center gap-x-3">
            <button
              type="button"
              onClick={() => askAi("suggest")}
              disabled={aiPending || busy}
              className="inline-flex min-h-11 items-center text-sm font-medium text-info hover:underline disabled:opacity-60 sm:min-h-0"
            >
              {aiPending ? "Escrevendo…" : "Sugerir resposta"}
            </button>
            {text.trim() ? (
              <button
                type="button"
                onClick={() => askAi("rewrite")}
                disabled={aiPending || busy}
                className="inline-flex min-h-11 items-center text-sm font-medium text-info hover:underline disabled:opacity-60 sm:min-h-0"
              >
                Melhorar texto
              </button>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          aria-pressed={noteMode}
          onClick={() => {
            setNoteMode((on) => !on);
            setFile(null);
            setFileError(null);
            inputRef.current?.focus();
          }}
          className="ml-auto inline-flex min-h-11 items-center text-sm font-medium text-info hover:underline sm:min-h-0"
        >
          {noteMode ? "Voltar para mensagem" : "Nota interna"}
        </button>
      </div>
    </form>
  );
}
