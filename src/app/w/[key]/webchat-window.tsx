"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

interface Visitor {
  visitorId: string;
  token: string;
  name: string | null;
}
interface ChatMessage {
  id: string;
  from: "visitor" | "team";
  text: string;
  at: string;
}

const POLL_MS = 4000;
const ERRORS: Record<string, string> = {
  rate_limited: "Muitas mensagens seguidas. Espere um pouco e tente de novo.",
  too_long: "Mensagem longa demais.",
  empty: "Escreva uma mensagem.",
};

const storageKey = (chatKey: string) => `fidera-webchat-${chatKey}`;
const time = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function readVisitor(chatKey: string): Visitor | null {
  try {
    return JSON.parse(localStorage.getItem(storageKey(chatKey)) ?? "null") as Visitor | null;
  } catch {
    return null;
  }
}

function saveVisitor(chatKey: string, visitor: Visitor) {
  try {
    localStorage.setItem(storageKey(chatKey), JSON.stringify(visitor));
  } catch {
    // Private browsing: the chat still works for this visit.
  }
}

export function WebchatWindow({ chatKey, businessName }: { chatKey: string; businessName: string }) {
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Confirms the saved id with the server, or gets a new one.
  useEffect(() => {
    const saved = readVisitor(chatKey);
    fetch(`/api/webchat/${chatKey}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: saved?.visitorId, token: saved?.token }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((session: { visitorId: string; token: string }) => {
        const next = { visitorId: session.visitorId, token: session.token, name: session.visitorId === saved?.visitorId ? saved.name : null };
        saveVisitor(chatKey, next);
        setVisitor(next);
      })
      .catch(() => setError("O chat não está disponível agora."))
      .finally(() => setReady(true));
  }, [chatKey]);

  const load = useCallback(async () => {
    if (!visitor) return;
    const query = new URLSearchParams({ visitorId: visitor.visitorId, token: visitor.token });
    const response = await fetch(`/api/webchat/${chatKey}/messages?${query}`).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json()) as { messages: ChatMessage[] };
    setMessages(data.messages);
  }, [chatKey, visitor]);

  useEffect(() => {
    if (!visitor?.name) return;
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [visitor, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!visitor || sending) return;
    const first = !visitor.name;
    if (first && !name.trim()) {
      setError("Diga seu nome para começar.");
      return;
    }
    setSending(true);
    setError(null);
    const response = await fetch(`/api/webchat/${chatKey}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: visitor.visitorId, token: visitor.token, text, ...(first ? { name, phone } : {}) }),
    }).catch(() => null);
    setSending(false);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(ERRORS[body?.error ?? ""] ?? "Não foi possível enviar. Tente de novo.");
      return;
    }
    setText("");
    if (first) {
      const next = { ...visitor, name: name.trim() };
      saveVisitor(chatKey, next);
      setVisitor(next);
    } else {
      void load();
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-text">
      <header className="flex items-center gap-3 bg-brand px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{businessName || "Fale com a gente"}</h1>
          <p className="text-xs text-white/85">Respondemos por aqui assim que possível.</p>
        </div>
        <button
          type="button"
          onClick={() => window.parent.postMessage("fidera-webchat-close", "*")}
          aria-label="Fechar o chat"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-white hover:bg-white/15"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <main role="log" aria-live="polite" aria-label="Mensagens" className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="m-auto max-w-xs text-center text-sm text-text-muted">
            {ready ? "Mande sua mensagem. A equipe responde aqui mesmo." : "Carregando…"}
          </p>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className={m.from === "visitor" ? "flex justify-end" : "flex justify-start"}>
            <p
              className={
                m.from === "visitor"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3 py-2 text-sm whitespace-pre-wrap break-words text-white"
                  : "max-w-[85%] rounded-2xl rounded-bl-md bg-surface px-3 py-2 text-sm whitespace-pre-wrap break-words ring-1 ring-border"
              }
            >
              {m.text}
              <span className={m.from === "visitor" ? "mt-0.5 block text-right text-[11px] text-white/80" : "mt-0.5 block text-right text-[11px] text-text-muted"}>
                {time(m.at)}
              </span>
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </main>

      <form onSubmit={send} className="grid gap-2 border-t border-border bg-surface p-3">
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {visitor && !visitor.name ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Seu nome</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" required className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base sm:text-sm" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">
                WhatsApp <span className="font-normal text-text-muted">(opcional)</span>
              </span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" className="min-h-11 rounded-lg border border-border bg-surface px-3 text-base sm:text-sm" />
            </label>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <label htmlFor="webchat-text" className="sr-only">
            Mensagem
          </label>
          <textarea
            id="webchat-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={2000}
            required
            disabled={!visitor}
            placeholder="Escreva sua mensagem"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-base [field-sizing:content] sm:text-sm"
          />
          <button
            type="submit"
            disabled={!visitor || sending}
            className="min-h-11 shrink-0 rounded-xl bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </div>
        <p className="text-[11px] text-text-muted">Ao enviar, você concorda que o salão guarde esta conversa para te atender.</p>
      </form>
    </div>
  );
}
