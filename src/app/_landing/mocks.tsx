import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Avatar, cx } from "@/components/ui";

/**
 * Drawings of the product for the home page, made of the app's own pieces. They use fictional
 * people and are hidden from screen readers: the text beside each one says the same thing.
 */

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        "overflow-hidden rounded-[var(--radius-card)] bg-surface text-left shadow-[0_30px_70px_-30px_rgb(43_22_64/0.45)] ring-1 ring-border/80",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Bubble({ from, children, meta }: { from: "them" | "us"; children: ReactNode; meta?: string }) {
  return (
    <div className={cx("flex", from === "us" ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[82%] rounded-[18px] px-3.5 py-2 text-[13px] leading-snug",
          from === "us" ? "rounded-br-md bg-[#ece2fb]" : "rounded-bl-md bg-surface shadow-xs",
        )}
      >
        {children}
        {meta ? <span className="mt-0.5 block text-right text-[10px] text-text-muted">{meta}</span> : null}
      </div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[90%] items-center gap-2 rounded-xl border border-warning/25 bg-[#fdf3e6] px-3 py-1.5 text-[11px] text-text">
      <Icon name="sparkles" className="size-3.5 shrink-0 text-brand" />
      {children}
    </div>
  );
}

function DateLink({ children }: { children: ReactNode }) {
  return <span className="font-medium text-info underline decoration-dotted underline-offset-2">{children}</span>;
}

/** The AI talking with a client and booking, with the note the team sees. */
export function AiMock({ className }: { className?: string }) {
  return (
    <Frame className={cx("flex flex-col", className)}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Avatar name="Carla Mendes" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-medium">Carla Mendes</p>
          <p className="text-[11px] text-text-muted">WhatsApp</p>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-border bg-brand-soft/60 px-4 py-2 text-[12px]">
        <Icon name="sparkles" className="size-3.5 text-brand" /> IA respondendo esta conversa
      </div>
      <div className="flex flex-1 flex-col gap-2 bg-sunken p-4">
        <Bubble from="them" meta="09:12">
          Oi! Queria marcar corte e escova <DateLink>sábado de manhã</DateLink>
        </Bubble>
        <Bubble from="us" meta="09:12 · automática">
          Oi, Carla! Sábado tenho 9h, 10h ou 11h30 com a Bia. Qual fica melhor?
        </Bubble>
        <Bubble from="them" meta="09:13">
          9h!
        </Bubble>
        <Bubble from="us" meta="09:13 · automática">
          Prontinho! Sábado, 14/11, às 9h com a Bia. Qualquer coisa é só avisar ✨
        </Bubble>
        <Note>IA agendou: Corte feminino, Sábado 14/11 às 09:00, com Bia</Note>
      </div>
    </Frame>
  );
}

const AGENDA_DAYS = [
  { short: "QUI", n: 12 },
  { short: "SEX", n: 13 },
  { short: "SÁB", n: 14, today: true },
];
const EVENTS = [
  { day: 0, start: 1, len: 2, name: "Júlia Prado", info: "Coloração", color: "bg-[#ece3fb] border-l-brand" },
  { day: 0, start: 3.5, len: 1, name: "Pedro Alves", info: "Barba", color: "bg-[#e2ebfd] border-l-info" },
  { day: 1, start: 0, len: 1, name: "Rita Gomes", info: "Escova", color: "bg-[#ddf2e4] border-l-success" },
  { day: 1, start: 2, len: 1.5, name: "Paula Melo", info: "Cílios", color: "bg-[#fdead6] border-l-warning" },
  { day: 2, start: 0, len: 1, name: "Carla Mendes", info: "Corte · Bia", color: "bg-[#ece3fb] border-l-brand", fresh: true },
  { day: 2, start: 1.5, len: 1, name: "Lucas Rocha", info: "Corte masc.", color: "bg-[#e2ebfd] border-l-info" },
];
const ROW = 44;

/** A few days of the agenda: appointments sit at their time, colored by professional. */
export function AgendaMock({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="rounded-full border border-border px-3 py-1 text-[12px] font-semibold">Hoje</span>
        <span className="font-display text-[17px] font-medium">Novembro de 2026</span>
        <span className="ml-auto flex rounded-full border border-border p-0.5 text-[11px] font-semibold">
          <span className="rounded-full px-2.5 py-1 text-text-muted">Dia</span>
          <span className="rounded-full bg-plum px-2.5 py-1 text-on-plum">Semana</span>
        </span>
      </div>
      <div className="flex border-b border-border">
        <div className="w-11 shrink-0" />
        {AGENDA_DAYS.map((d) => (
          <div key={d.n} className="flex flex-1 flex-col items-center gap-0.5 border-l border-border/70 py-2">
            <span className={cx("text-[10px] font-semibold tracking-[0.06em]", d.today ? "text-brand" : "text-text-muted")}>{d.short}</span>
            <span className={cx("grid size-8 place-items-center rounded-full font-display text-base", d.today && "bg-brand text-white")}>{d.n}</span>
          </div>
        ))}
      </div>
      <div className="relative flex" style={{ height: ROW * 4.5 }}>
        <div className="relative w-11 shrink-0">
          {["10:00", "11:00", "12:00", "13:00"].map((h, i) => (
            <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-text-muted" style={{ top: (i + 1) * ROW }}>
              {h}
            </span>
          ))}
        </div>
        {AGENDA_DAYS.map((d, di) => (
          <div key={d.n} className="relative flex-1 border-l border-border/70">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * ROW }} />
            ))}
            {EVENTS.filter((e) => e.day === di).map((e) => (
              <div
                key={e.name}
                className={cx(
                  "absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-[10.5px] leading-tight",
                  e.color,
                  e.fresh && "ring-2 ring-brand/40",
                )}
                style={{ top: e.start * ROW + 1, height: e.len * ROW - 3 }}
              >
                <span className="block truncate font-semibold">{e.name}</span>
                <span className="block truncate text-text-muted">{e.info}</span>
              </div>
            ))}
            {di === 2 ? (
              <div className="absolute inset-x-0 z-10 flex items-center" style={{ top: ROW * 2.6 }}>
                <span className="-ml-1 size-2 rounded-full bg-danger" />
                <span className="h-0.5 flex-1 bg-danger" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Frame>
  );
}

const CONVERSATIONS = [
  { name: "Ana Souza", text: "Tem horário no sábado?", time: "09:42", unread: 2, label: "VIP" },
  { name: "Bruno Lima", text: "Você: Fechado, até amanhã!", time: "09:15", unread: 0, label: null },
  { name: "Carla Dias", text: "Quanto fica corte e barba?", time: "Ontem", unread: 1, label: null },
  { name: "Diego Rocha", text: "Obrigado!", time: "Ontem", unread: 0, label: null },
];

/** The team's inbox: one number, everyone answering, who is waiting stands out. */
export function InboxMock({ className }: { className?: string }) {
  return (
    <Frame className={cx("grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]", className)}>
      <div className="bg-background sm:border-r sm:border-border">
        <div className="px-4 pt-4 pb-2">
          <p className="font-display text-xl font-medium">Conversas</p>
          <div className="mt-2 flex gap-1.5 text-[11px] font-semibold">
            <span className="rounded-full bg-plum px-2.5 py-1 whitespace-nowrap text-on-plum">Todas</span>
            <span className="rounded-full border border-border bg-surface px-2.5 py-1 whitespace-nowrap text-text-muted">Sem resposta</span>
          </div>
        </div>
        <ul className="flex flex-col gap-1 p-2">
          {CONVERSATIONS.map((c, i) => (
            <li key={c.name} className={cx("flex items-center gap-2.5 rounded-2xl px-2.5 py-2.5", i === 0 && "bg-surface shadow-sm ring-1 ring-brand/25")}>
              <Avatar name={c.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-semibold">{c.name}</span>
                  <span className={cx("ml-auto shrink-0 text-[11px]", c.unread ? "text-brand" : "text-text-muted")}>{c.time}</span>
                </div>
                <p className="truncate text-[12px] text-text-muted">{c.text}</p>
              </div>
              {c.unread > 0 ? (
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-semibold text-white">{c.unread}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden flex-col sm:flex">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Avatar name="Ana Souza" size="sm" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-medium">Ana Souza</p>
            <p className="text-[11px] text-text-muted">Com Bia · Atendimento</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 bg-sunken p-4">
          <Bubble from="them" meta="09:40">
            Oi! Tem horário no <DateLink>sábado</DateLink>?
          </Bubble>
          <Bubble from="us" meta="09:41 · Bia">
            Tenho às 9h e às 10h30. Qual prefere?
          </Bubble>
          <div className="mx-auto max-w-[85%] rounded-xl border border-warning/25 bg-[#fdf3e6] px-3 py-1.5 text-[11px]">
            Nota interna: cliente prefere a Bia
          </div>
        </div>
        <div className="border-t border-border bg-background p-3">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-1.5 pl-3.5">
            <span className="flex-1 text-[13px] text-text-muted">/horario</span>
            <span className="grid size-8 place-items-center rounded-xl bg-brand text-white">
              <Icon name="send" className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** Today's list of clients due to come back, each with a ready message. */
export function CallbackMock({ className }: { className?: string }) {
  const people = [
    { name: "Fernanda Luz", service: "Corte feminino", due: "45 dias desde a última visita" },
    { name: "Rafael Nunes", service: "Barba", due: "Venceu ontem" },
    { name: "Tatiane Reis", service: "Manicure", due: "Vence hoje" },
  ];
  return (
    <Frame className={cx("p-4 sm:p-5", className)}>
      <div className="flex items-baseline justify-between">
        <p className="font-display text-xl font-medium">Chamar hoje</p>
        <span className="text-[12px] text-text-muted">3 clientes</span>
      </div>
      <ul className="mt-3 grid gap-2">
        {people.map((p) => (
          <li key={p.name} className="flex items-center gap-3 rounded-2xl bg-background p-3">
            <Avatar name={p.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{p.name}</p>
              <p className="truncate text-[11px] text-text-muted">
                {p.service} · <span className="text-warning">{p.due}</span>
              </p>
            </div>
            <span className="shrink-0 rounded-xl bg-brand px-3 py-1.5 text-[12px] font-semibold text-white">Chamar</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-xl bg-brand-soft/70 px-3 py-2 text-[12px]">“Oi, Fernanda! Já faz um tempinho do seu corte. Quer marcar essa semana?”</p>
    </Frame>
  );
}

/** A salon's website with the chat open in the corner. */
export function WebchatMock({ className }: { className?: string }) {
  return (
    <Frame className={cx("relative bg-background", className)}>
      <div className="flex items-center gap-1.5 border-b border-border bg-surface px-3 py-2">
        <span className="size-2.5 rounded-full bg-[#f87171]" />
        <span className="size-2.5 rounded-full bg-[#fbbf24]" />
        <span className="size-2.5 rounded-full bg-[#34d399]" />
        <span className="ml-3 flex-1 truncate rounded-full bg-sunken px-3 py-0.5 text-[11px] text-text-muted">www.seusalao.com.br</span>
      </div>
      <div className="grid gap-2 p-5 pb-28 sm:pr-56">
        <div className="h-3 w-32 rounded-full bg-border" />
        <div className="h-6 w-56 rounded-full bg-[#e2d6c8]" />
        <div className="h-2.5 w-48 rounded-full bg-border" />
        <div className="h-2.5 w-40 rounded-full bg-border" />
        <div className="mt-3 h-20 rounded-2xl bg-sunken" />
      </div>
      <div className="absolute right-3 bottom-16 w-52 overflow-hidden rounded-2xl bg-surface shadow-lg ring-1 ring-border">
        <div className="bg-plum px-3 py-2 text-[12px] font-semibold text-on-plum">Fale com o salão</div>
        <div className="grid gap-1.5 bg-sunken p-2.5">
          <Bubble from="them">Vocês fazem progressiva?</Bubble>
          <Bubble from="us">Fazemos sim! Quer ver um horário?</Bubble>
        </div>
      </div>
      <span className="absolute right-3 bottom-3 grid size-11 place-items-center rounded-full bg-brand text-white shadow-lg">
        <Icon name="message" className="size-5" />
      </span>
    </Frame>
  );
}
