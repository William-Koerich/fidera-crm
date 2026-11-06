import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Avatar, cx } from "@/components/ui";

/**
 * Drawings of the product for the home page, made of the app's own pieces. They
 * use fictional people and are hidden from screen readers: the text beside each
 * one says the same thing.
 */

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={cx("overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_60px_-24px_rgb(76_29_149/0.35)]", className)}
    >
      {children}
    </div>
  );
}

function Bubble({ from, children, note }: { from: "them" | "us"; children: ReactNode; note?: string }) {
  return (
    <div className={cx("flex flex-col gap-1", from === "us" ? "items-end" : "items-start")}>
      <p
        className={cx(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
          from === "us" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-background text-text ring-1 ring-border",
        )}
      >
        {children}
      </p>
      {note ? <span className="text-[11px] text-text-muted">{note}</span> : null}
    </div>
  );
}

const CONVERSATIONS = [
  { name: "Ana Souza", text: "Tem horário no sábado?", time: "09:42", unread: 2 },
  { name: "Bruno Lima", text: "Você: Fechado, até amanhã!", time: "09:15", unread: 0 },
  { name: "Carla Dias", text: "Quanto fica corte e barba?", time: "Ontem", unread: 1 },
  { name: "Diego Rocha", text: "Obrigado!", time: "Ontem", unread: 0 },
];

/** The inbox, with the list beside the open conversation on wider screens. */
export function InboxMock() {
  return (
    <Frame className="grid text-left sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="border-border sm:border-r">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Conversas</span>
          <span className="ml-auto rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info">2 aguardando</span>
        </div>
        <ul>
          {CONVERSATIONS.map((c, i) => (
            <li key={c.name} className={cx("flex items-center gap-3 px-4 py-2.5", i === 0 && "bg-info-soft")}>
              <Avatar name={c.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-text-muted">{c.time}</span>
                </div>
                <p className="truncate text-xs text-text-muted">{c.text}</p>
              </div>
              {c.unread > 0 ? (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">
                  {c.unread}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden flex-col sm:flex">
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <Avatar name="Ana Souza" size="sm" />
          <div>
            <p className="text-sm font-semibold">Ana Souza</p>
            <p className="text-xs text-text-muted">WhatsApp</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <Bubble from="them">Oi! Tem horário no sábado de manhã?</Bubble>
          <Bubble from="us">Temos às 9h e às 10h30. Qual prefere?</Bubble>
          <Bubble from="them">Pode ser às 9h</Bubble>
        </div>
        <div className="flex items-center gap-2 border-t border-border p-3">
          <span className="flex-1 rounded-xl bg-background px-3 py-2 text-sm text-text-muted">Escreva uma resposta</span>
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-white">
            <Icon name="send" className="size-4" />
          </span>
        </div>
      </div>
    </Frame>
  );
}

/** Two people answering the same number: who is waiting stands out. */
export function WaitingMock() {
  return (
    <Frame className="p-4 sm:p-6">
      <p className="text-sm font-semibold">Aguardando resposta</p>
      <ul className="mt-3 grid gap-2">
        {CONVERSATIONS.filter((c) => c.unread > 0).map((c) => (
          <li key={c.name} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Avatar name={c.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="truncate text-xs text-text-muted">{c.text}</p>
            </div>
            <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">{c.unread} nova{c.unread > 1 ? "s" : ""}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-sm text-text-muted">
        <Icon name="users" className="size-4" /> A equipe toda vê as mesmas conversas
      </div>
    </Frame>
  );
}

/** Typing "/" lists the saved texts. */
export function QuickRepliesMock() {
  const replies = [
    { shortcut: "horario", text: "Atendemos de segunda a sábado, das 9h às 18h." },
    { shortcut: "endereco", text: "Estamos na Rua das Flores, 100, Centro." },
    { shortcut: "precos", text: "Corte a partir de R$ 40. Quer ver a lista?" },
  ];
  return (
    <Frame className="p-4 sm:p-6">
      <ul className="rounded-xl border border-border p-1 shadow-sm">
        {replies.map((r, i) => (
          <li key={r.shortcut} className={cx("rounded-lg px-3 py-2", i === 0 && "bg-background")}>
            <p className="text-sm font-medium">/{r.shortcut}</p>
            <p className="truncate text-xs text-text-muted">{r.text}</p>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2 rounded-2xl border border-info p-1.5 pl-3.5 ring-3 ring-info/15">
        <span className="flex-1 text-sm">/h</span>
        <span className="grid size-9 place-items-center rounded-xl bg-brand text-white">
          <Icon name="send" className="size-4" />
        </span>
      </div>
    </Frame>
  );
}

/** A customer message outside business hours and its automatic answer. */
export function AutoReplyMock() {
  return (
    <Frame className="grid gap-3 p-4 sm:p-6">
      <p className="self-center justify-self-center rounded-full bg-background px-3 py-1 text-xs font-medium text-text-muted ring-1 ring-border">
        Hoje, 22:14
      </p>
      <Bubble from="them">Boa noite! Vocês abrem amanhã?</Bubble>
      <Bubble from="us" note="automática">
        Oi! Estamos fechados agora. Respondemos a partir das 9h.
      </Bubble>
      <div className="mt-1 flex items-center gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">
        <Icon name="clock" className="size-4 shrink-0" /> Continua aguardando a sua resposta
      </div>
    </Frame>
  );
}
