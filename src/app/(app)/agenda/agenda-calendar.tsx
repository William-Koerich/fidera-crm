"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Button, cx } from "@/components/ui";
import { Alert } from "@/components/ui/feedback";
import { addDays, isoToLocal, weekStart, weekdayOf, type AppointmentStatus, type ServiceOption } from "@/lib/agenda/form";
import { hourRange, layoutDay, openWindow, toClock, toMinutes } from "@/lib/agenda/layout";
import type { AppointmentItem } from "@/lib/agenda/queries";
import type { TeamMember } from "@/lib/inbox/queries";
import type { BusinessHours } from "@/lib/replies/auto-reply";
import { setAppointmentStatusAction } from "./actions";
import { AppointmentDialog, type AppointmentDraft } from "./appointment-dialog";
import { memberName } from "@/lib/team";

export type AgendaView = "dia" | "semana";

/** One hour on the grid. */
const HOUR_PX = 56;
const SNAP_MINUTES = 30;
const WEEKDAY_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const WEEKDAY_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** One color per professional, in the order of the team list. Text stays dark on every one. */
const COLORS = [
  { box: "bg-[#ece3fb] border-l-brand", dot: "bg-brand" },
  { box: "bg-[#e2ebfd] border-l-info", dot: "bg-info" },
  { box: "bg-[#ddf2e4] border-l-success", dot: "bg-success" },
  { box: "bg-[#fdead6] border-l-warning", dot: "bg-warning" },
  { box: "bg-[#fbe2ee] border-l-[#be185d]", dot: "bg-[#be185d]" },
  { box: "bg-[#d9f1ee] border-l-[#0f766e]", dot: "bg-[#0f766e]" },
];
const UNASSIGNED = { box: "bg-sunken border-l-text-muted", dot: "bg-text-muted" };

const monthTitle = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} de ${day.slice(0, 4)}`;
const dayTitle = (day: string) => `${WEEKDAY_LONG[weekdayOf(day)]}, ${Number(day.slice(8, 10))} de ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
const staffLabel = (member: TeamMember | undefined) => memberName(member, "Ex-integrante");

const narrowQuery = "(max-width: 767px)";
function useNarrow() {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(narrowQuery);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(narrowQuery).matches,
    () => false,
  );
}

/** Minutes since midnight in Brasília, refreshed every minute for the "now" line. */
function useNowMinutes() {
  const read = () => {
    const { date, time } = isoToLocal(new Date());
    return { date, minutes: toMinutes(time) };
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => setNow(read()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function AgendaCalendar({
  day,
  today,
  view: chosenView,
  staffId,
  items,
  members,
  services,
  businessHours,
}: {
  /** The day the person is looking at; the week around it is loaded. */
  day: string;
  today: string;
  /** From the address; null lets the screen size choose. */
  view: AgendaView | null;
  staffId: string | null;
  items: AppointmentItem[];
  members: TeamMember[];
  services: ServiceOption[];
  businessHours: BusinessHours;
}) {
  const narrow = useNarrow();
  const view: AgendaView = chosenView ?? (narrow ? "dia" : "semana");
  const monday = weekStart(day);
  const days = view === "dia" ? [day] : Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const now = useNowMinutes();

  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [opened, setOpened] = useState<AppointmentItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const colorOf = (id: string | null) => {
    const index = members.findIndex((m) => m.id === id);
    return index === -1 ? UNASSIGNED : COLORS[index % COLORS.length]!;
  };
  const href = (target: { day?: string; view?: AgendaView; staff?: string | null }) => {
    const params = new URLSearchParams({ dia: target.day ?? day });
    const v = target.view ?? chosenView;
    if (v) params.set("visao", v);
    const s = target.staff === undefined ? staffId : target.staff;
    if (s) params.set("pessoa", s);
    return `/agenda?${params}`;
  };
  const step = view === "dia" ? 1 : 7;

  const ranged = useMemo(
    () => items.map((item) => ({ item, date: item.date, start: toMinutes(item.time), end: Math.min(24 * 60, toMinutes(item.time) + item.durationMinutes) })),
    [items],
  );
  const { from, to } = hourRange(days, businessHours, ranged);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const y = (minutes: number) => ((minutes - from * 60) / 60) * HOUR_PX;

  // Start scrolled to where the day is happening: an hour before now, or the opening time.
  const scroller = useRef<HTMLDivElement>(null);
  const firstOpen = Math.min(...days.map((d) => openWindow(d, businessHours)?.start ?? 9 * 60));
  const scrollTarget = days.includes(today) ? Math.max(from * 60, now.minutes - 60) : firstOpen;
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${days[0]}-${view}`;
    if (!scroller.current || scrolledFor.current === key) return;
    scrolledFor.current = key;
    scroller.current.scrollTop = Math.max(0, y(scrollTarget) - 8);
  });

  const close = () => {
    setDraft(null);
    setOpened(null);
    setMessage(null);
  };
  const create = (date: string, time: string) => {
    setOpened(null);
    setMessage(null);
    setDraft({ clientName: "", date, time, durationMinutes: 30, staffId: staffId ?? undefined });
  };
  const open = (item: AppointmentItem) => {
    setOpened(item);
    setMessage(null);
    setDraft({
      appointmentId: item.id,
      clientName: item.clientName,
      date: item.date,
      time: item.time,
      durationMinutes: item.durationMinutes,
      service: item.service,
      notes: item.notes,
      staffId: item.staffId,
    });
  };
  const setStatus = (status: AppointmentStatus) => {
    if (!opened) return;
    startTransition(async () => {
      const result = await setAppointmentStatusAction(opened.id, status).catch(() => ({ ok: false, message: "Não foi possível salvar. Tente de novo." }));
      if (result.ok) close();
      else setMessage(result.message ?? null);
    });
  };
  const nextFreeHalfHour = () => {
    const base = days.includes(today) ? now.minutes : firstOpen;
    return toClock(Math.min(23 * 60 + 30, Math.ceil(base / SNAP_MINUTES) * SNAP_MINUTES));
  };

  return (
    <div className="flex min-h-0 flex-1 gap-6">
      {/* Side column, on wide screens: create, month and professionals. */}
      <aside className="hidden w-60 shrink-0 flex-col gap-6 overflow-y-auto pb-4 xl:flex">
        <button
          type="button"
          onClick={() => create(days.includes(today) ? today : days[0]!, nextFreeHalfHour())}
          className="inline-flex min-h-14 items-center gap-3 self-start rounded-2xl bg-surface px-5 pr-6 text-[0.95rem] font-semibold shadow-md ring-1 ring-border transition-shadow hover:shadow-lg"
        >
          <span aria-hidden className="text-2xl leading-none text-brand">+</span> Criar
        </button>
        <MiniMonth day={day} today={today} selected={days} href={(d) => href({ day: d })} />
        <nav aria-label="Profissionais" className="grid gap-0.5">
          <p className="px-2 pb-1 text-sm font-semibold">Profissionais</p>
          <StaffLink href={href({ staff: null })} active={!staffId} dot="bg-text" label="Todos" />
          {members.map((m) => (
            <StaffLink key={m.id} href={href({ staff: m.id })} active={staffId === m.id} dot={colorOf(m.id).dot} label={staffLabel(m)} />
          ))}
        </nav>
      </aside>

      <section aria-label="Agenda" className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <Link
            href={href({ day: today })}
            className="inline-flex min-h-10 items-center rounded-full border border-border bg-surface px-4 text-sm font-semibold hover:bg-sunken"
          >
            Hoje
          </Link>
          <Link
            href={href({ day: addDays(day, -step) })}
            aria-label={view === "dia" ? "Dia anterior" : "Semana anterior"}
            className="grid size-10 place-items-center rounded-full text-text-muted hover:bg-sunken hover:text-text"
          >
            <Icon name="back" className="size-5" />
          </Link>
          <Link
            href={href({ day: addDays(day, step) })}
            aria-label={view === "dia" ? "Próximo dia" : "Próxima semana"}
            className="grid size-10 place-items-center rounded-full text-text-muted hover:bg-sunken hover:text-text"
          >
            <Icon name="chevron-right" className="size-5" />
          </Link>
          <h2 className="order-first w-full min-w-0 truncate font-display text-xl font-medium tracking-[-0.01em] first-letter:uppercase sm:order-none sm:w-auto sm:text-2xl" aria-live="polite">
            {view === "dia" ? dayTitle(day) : monthTitle(days[3]!)}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <div role="group" aria-label="Visão" className="flex rounded-full border border-border bg-surface p-0.5">
              {(["dia", "semana"] as const).map((v) => (
                <Link
                  key={v}
                  href={href({ view: v })}
                  aria-current={view === v ? "page" : undefined}
                  className={cx(
                    "inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-semibold",
                    view === v ? "bg-plum text-on-plum" : "text-text-muted hover:text-text",
                  )}
                >
                  {v === "dia" ? "Dia" : "Semana"}
                </Link>
              ))}
            </div>
            <span className="hidden sm:block xl:hidden">
              <Button size="sm" onClick={() => create(days.includes(today) ? today : days[0]!, nextFreeHalfHour())}>
                Criar
              </Button>
            </span>
          </div>
          {members.length > 1 ? (
            <div className="flex w-full gap-1.5 overflow-x-auto pt-1 xl:hidden">
              <StaffChip href={href({ staff: null })} active={!staffId} dot={null} label="Todos" />
              {members.map((m) => (
                <StaffChip key={m.id} href={href({ staff: m.id })} active={staffId === m.id} dot={colorOf(m.id).dot} label={staffLabel(m)} />
              ))}
            </div>
          ) : null}
        </div>

        {/* Grid */}
        <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto overscroll-contain rounded-[var(--radius-card)] bg-surface shadow-sm ring-1 ring-border/70">
          <div className="min-w-full">
            {/* Day headers */}
            <div className="sticky top-0 z-40 flex border-b border-border bg-surface">
              <div className="w-14 shrink-0" />
              {days.map((d) => {
                const isToday = d === today;
                return (
                  <Link
                    key={d}
                    href={href({ day: d, view: "dia" })}
                    className="flex min-w-0 flex-1 flex-col items-center gap-0.5 border-l border-border/70 py-2 first:border-l-0 hover:bg-sunken/60"
                    aria-label={`${dayTitle(d)}${isToday ? " (hoje)" : ""}`}
                  >
                    <span className={cx("text-[11px] font-semibold tracking-[0.06em]", isToday ? "text-brand" : "text-text-muted")}>{WEEKDAY_SHORT[weekdayOf(d)]}</span>
                    <span
                      className={cx(
                        "grid size-10 place-items-center rounded-full font-display text-xl tabular",
                        isToday ? "bg-brand text-white" : "text-text",
                      )}
                    >
                      {Number(d.slice(8, 10))}
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* Hours */}
            <div className="relative flex" style={{ height: (to - from) * HOUR_PX }}>
              <div className="relative w-14 shrink-0">
                {hours.map((h) =>
                  h === from ? null : (
                    <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-text-muted tabular" style={{ top: y(h * 60) }}>
                      {String(h).padStart(2, "0")}:00
                    </span>
                  ),
                )}
              </div>
              {days.map((d) => (
                <DayColumn
                  key={d}
                  day={d}
                  from={from}
                  to={to}
                  y={y}
                  items={ranged.filter((r) => r.date === d)}
                  open={openWindow(d, businessHours)}
                  nowMinutes={d === now.date ? now.minutes : null}
                  colorOf={colorOf}
                  staffName={(id) => (id ? staffLabel(members.find((m) => m.id === id)) : "A definir")}
                  onCreate={(time) => create(d, time)}
                  onOpen={open}
                  compact={view === "semana"}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* On phones, creating sits under the thumb. */}
      <button
        type="button"
        aria-label="Criar agendamento"
        onClick={() => create(days.includes(today) ? today : days[0]!, nextFreeHalfHour())}
        className="fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-2xl bg-brand text-3xl leading-none text-white shadow-lg shadow-brand/30 sm:hidden"
      >
        <span aria-hidden>+</span>
      </button>

      {draft ? (
        <AppointmentDialog
          key={draft.appointmentId ?? `new-${draft.date}-${draft.time}`}
          draft={draft}
          members={members}
          services={services}
          onClose={close}
          footer={
            opened ? (
              <div className="grid gap-3">
                {message ? <Alert tone="danger">{message}</Alert> : null}
                {opened.conversationId ? (
                  <Link href={`/inbox/${opened.conversationId}`} className="text-sm font-medium text-info hover:underline">
                    Abrir conversa com o cliente
                  </Link>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {opened.status !== "scheduled" ? (
                    <Button variant="secondary" size="sm" loading={pending} onClick={() => setStatus("scheduled")}>
                      Voltar para agendado
                    </Button>
                  ) : (
                    <>
                      <Button variant="secondary" size="sm" loading={pending} onClick={() => setStatus("done")}>
                        Concluído
                      </Button>
                      <Button variant="secondary" size="sm" loading={pending} onClick={() => setStatus("no_show")}>
                        Faltou
                      </Button>
                    </>
                  )}
                  <Button variant="danger-ghost" size="sm" loading={pending} onClick={() => setStatus("cancelled")}>
                    Cancelar agendamento
                  </Button>
                </div>
              </div>
            ) : undefined
          }
        />
      ) : null}
    </div>
  );
}

function DayColumn({
  day,
  from,
  to,
  y,
  items,
  open,
  nowMinutes,
  colorOf,
  staffName,
  onCreate,
  onOpen,
  compact,
}: {
  day: string;
  from: number;
  to: number;
  y: (minutes: number) => number;
  items: { item: AppointmentItem; start: number; end: number }[];
  open: { start: number; end: number } | null;
  nowMinutes: number | null;
  colorOf: (id: string | null) => { box: string; dot: string };
  staffName: (id: string | null) => string;
  onCreate: (time: string) => void;
  onOpen: (item: AppointmentItem) => void;
  compact: boolean;
}) {
  const placed = layoutDay(items, (r) => r);
  const total = (to - from) * 60;
  return (
    <div
      className="relative min-w-0 flex-1 cursor-pointer border-l border-border/70"
      onClick={(event) => {
        // A click on empty space books at that time, rounded down to the half hour.
        const rect = event.currentTarget.getBoundingClientRect();
        const minutes = from * 60 + ((event.clientY - rect.top) / rect.height) * total;
        onCreate(toClock(Math.max(from * 60, Math.min(23 * 60 + 30, Math.floor(minutes / SNAP_MINUTES) * SNAP_MINUTES))));
      }}
      aria-label={`Horários de ${dayTitle(day)}`}
    >
      {/* Closed hours: shaded, still clickable for an exception. */}
      {open ? (
        <>
          <div aria-hidden className="absolute inset-x-0 top-0 bg-sunken/70" style={{ height: Math.max(0, y(open.start)) }} />
          <div aria-hidden className="absolute inset-x-0 bottom-0 bg-sunken/70" style={{ top: Math.min(y(open.end), y(to * 60)) }} />
        </>
      ) : (
        <div aria-hidden className="absolute inset-0 bg-sunken/70" />
      )}
      {/* Hour and half-hour lines. */}
      {Array.from({ length: to - from }, (_, i) => (
        <div key={i} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-border/70" style={{ top: i * HOUR_PX }}>
          <div className="border-t border-dashed border-border/40" style={{ marginTop: HOUR_PX / 2 - 1 }} />
        </div>
      ))}

      {placed.map(({ item: { item }, start, end, lane, lanes }) => {
        const height = Math.max(22, y(end) - y(start) - 2);
        const short = height < 44;
        const color = colorOf(item.staffId);
        const done = item.status === "done";
        const noShow = item.status === "no_show";
        return (
          <button
            key={item.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(item);
            }}
            className={cx(
              "absolute z-10 overflow-hidden rounded-lg border-l-4 px-1.5 py-0.5 text-left text-xs leading-tight text-text shadow-xs ring-1 ring-surface transition-shadow hover:z-20 hover:shadow-md focus-visible:z-20",
              color.box,
              (done || noShow) && "opacity-60",
            )}
            style={{
              top: y(start) + 1,
              height,
              left: `calc(${(lane / lanes) * 100}% + 2px)`,
              width: `calc(${100 / lanes}% - 4px)`,
            }}
          >
            <span className={cx("block truncate font-semibold", noShow && "line-through")}>
              {done ? "✓ " : ""}
              {item.clientName}
              {short ? <span className="font-normal text-text-muted">, {item.time}</span> : null}
            </span>
            {!short ? (
              <span className="block truncate text-text-muted tabular">
                {item.time} – {toClock(Math.min(end, 24 * 60))}
              </span>
            ) : null}
            {!short && height >= 60 && item.service ? <span className="block truncate">{item.service}</span> : null}
            {!short && height >= 76 && !compact ? <span className="block truncate text-text-muted">{staffName(item.staffId)}</span> : null}
            <span className="sr-only">
              {noShow ? ", faltou" : done ? ", concluído" : ""}
            </span>
          </button>
        );
      })}

      {nowMinutes !== null && nowMinutes >= from * 60 && nowMinutes <= to * 60 ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 z-30 flex items-center" style={{ top: y(nowMinutes) - 5 }}>
          <span className="-ml-1.5 size-2.5 rounded-full bg-danger" />
          <span className="h-0.5 flex-1 bg-danger" />
        </div>
      ) : null}
    </div>
  );
}

function MiniMonth({ day, today, selected, href }: { day: string; today: string; selected: string[]; href: (day: string) => string }) {
  const first = `${day.slice(0, 8)}01`;
  const start = weekStart(first);
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const month = day.slice(0, 7);
  const prev = addDays(first, -1).slice(0, 8) + "01";
  const next = addDays(first, 32).slice(0, 8) + "01";
  return (
    <div className="px-1">
      <div className="flex items-center justify-between pb-1">
        <p className="pl-1 text-sm font-semibold first-letter:uppercase">{monthTitle(day)}</p>
        <div className="flex">
          <Link href={href(prev)} aria-label="Mês anterior" className="grid size-8 place-items-center rounded-full text-text-muted hover:bg-sunken">
            <Icon name="back" className="size-4" />
          </Link>
          <Link href={href(next)} aria-label="Próximo mês" className="grid size-8 place-items-center rounded-full text-text-muted hover:bg-sunken">
            <Icon name="chevron-right" className="size-4" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-text-muted">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((l, i) => (
          <span key={i} className="py-1">
            {l}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center text-xs">
        {weeks.flat().map((d) => (
          <Link
            key={d}
            href={href(d)}
            aria-label={dayTitle(d)}
            className={cx(
              "mx-auto grid size-8 place-items-center rounded-full tabular",
              d === today ? "bg-brand font-semibold text-white" : selected.includes(d) ? "bg-brand-soft font-semibold text-brand" : "hover:bg-sunken",
              d.slice(0, 7) !== month && d !== today && "text-text-muted/60",
            )}
          >
            {Number(d.slice(8, 10))}
          </Link>
        ))}
      </div>
    </div>
  );
}

function StaffLink({ href, active, dot, label }: { href: string; active: boolean; dot: string; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx("flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-sm", active ? "bg-brand-soft font-semibold" : "hover:bg-sunken")}
    >
      <span aria-hidden className={cx("size-3 shrink-0 rounded-[4px]", dot)} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function StaffChip({ href, active, dot, label }: { href: string; active: boolean; dot: string | null; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm",
        active ? "border-plum bg-plum text-on-plum" : "border-border bg-surface hover:bg-sunken",
      )}
    >
      {dot ? <span aria-hidden className={cx("size-2.5 rounded-full", dot)} /> : null}
      {label}
    </Link>
  );
}
