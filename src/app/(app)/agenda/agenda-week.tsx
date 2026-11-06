"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Button, cx } from "@/components/ui";
import { Alert } from "@/components/ui/feedback";
import { addDays, formatDay, isoToLocal, type AppointmentStatus } from "@/lib/agenda/form";
import type { AppointmentItem } from "@/lib/agenda/queries";
import type { TeamMember } from "@/lib/inbox/queries";
import { setAppointmentStatusAction } from "./actions";
import { AppointmentDialog, type AppointmentDraft } from "./appointment-dialog";

const STATUS_BADGE: Partial<Record<AppointmentStatus, { label: string; tone: "success" | "warning" }>> = {
  done: { label: "Concluído", tone: "success" },
  no_show: { label: "Faltou", tone: "warning" },
};

function endTime(item: AppointmentItem): string {
  const [hours, minutes] = item.time.split(":").map(Number);
  const total = hours! * 60 + minutes! + item.durationMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function AgendaWeek({ monday, today, items, members }: { monday: string; today: string; items: AppointmentItem[]; members: TeamMember[] }) {
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [opened, setOpened] = useState<AppointmentItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const staffName = (id: string | null) => (id ? (members.find((m) => m.id === id)?.email ?? "Ex-integrante da equipe") : "A definir");

  const close = () => {
    setDraft(null);
    setOpened(null);
    setMessage(null);
  };

  function open(item: AppointmentItem) {
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
  }

  function setStatus(status: AppointmentStatus) {
    if (!opened) return;
    startTransition(async () => {
      const result = await setAppointmentStatusAction(opened.id, status).catch(() => ({ ok: false, message: "Não foi possível salvar. Tente de novo." }));
      if (result.ok) close();
      else setMessage(result.message ?? null);
    });
  }

  return (
    <>
      <div>
        <Button onClick={() => setDraft({ clientName: "", date: today >= monday && today <= days[6]! ? today : monday, time: isoToLocal(new Date()).time.slice(0, 2) + ":00", durationMinutes: 30 })}>
          Novo agendamento
        </Button>
      </div>

      <ol className="grid gap-3 lg:grid-cols-7 lg:gap-2">
        {days.map((day) => {
          const list = items.filter((item) => item.date === day);
          return (
            <li key={day} className={cx("rounded-xl border bg-surface p-2 lg:min-h-48", day === today ? "border-brand" : "border-border")}>
              <h2 className={cx("px-1 py-1 text-sm font-medium", day === today ? "text-brand" : "text-text")}>
                {formatDay(day)}
                {day === today ? <span className="sr-only"> (hoje)</span> : null}
              </h2>
              {list.length === 0 ? (
                <p className="px-1 py-1 text-xs text-text-muted">Sem horários</p>
              ) : (
                <ul className="grid gap-1.5">
                  {list.map((item) => {
                    const badge = STATUS_BADGE[item.status];
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => open(item)}
                          className="grid min-h-11 w-full gap-0.5 rounded-lg bg-brand-soft p-2 text-left text-sm transition-colors hover:bg-info-soft"
                        >
                          <span className="font-medium tabular">
                            {item.time} – {endTime(item)}
                          </span>
                          <span className="truncate">{item.clientName}</span>
                          {item.service ? <span className="truncate text-xs text-text-muted">{item.service}</span> : null}
                          <span className="truncate text-xs text-text-muted">{staffName(item.staffId)}</span>
                          {badge ? (
                            <span className="justify-self-start">
                              <Badge tone={badge.tone}>{badge.label}</Badge>
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {draft ? (
        <AppointmentDialog
          key={draft.appointmentId ?? "new"}
          draft={draft}
          members={members}
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
    </>
  );
}
