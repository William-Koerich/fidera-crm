import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ButtonLink, PageHeader, Skeleton } from "@/components/ui";
import { addDays, formatDay, isoToLocal, validDay, weekStart } from "@/lib/agenda/form";
import { listServices, listWeekAppointments } from "@/lib/agenda/queries";
import { requireMembership } from "@/lib/auth";
import { listTeamMembers } from "@/lib/inbox/queries";
import { AgendaWeek } from "./agenda-week";
import { StaffFilter } from "./staff-filter";

export const metadata: Metadata = { title: "Agenda" };

export default function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-10">
      <PageHeader title="Agenda" description="Os horários marcados no salão. Agende também clicando na data dentro da conversa." />
      <Suspense fallback={<Skeleton className="mt-6 h-96" />}>
        <Week searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function parseDate(raw: unknown): string | null {
  const parts = typeof raw === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) : null;
  return parts ? validDay(Number(parts[1]), Number(parts[2]), Number(parts[3])) : null;
}

async function Week({ searchParams }: { searchParams: PageProps<"/agenda">["searchParams"] }) {
  const params = await searchParams;
  await connection();
  const me = await requireMembership();
  const today = isoToLocal(new Date()).date;
  const monday = weekStart(parseDate(params.semana) ?? today);
  const members = await listTeamMembers(me.organizationId);
  const staffId = members.find((m) => m.id === params.pessoa)?.id ?? null;
  const [items, services] = await Promise.all([listWeekAppointments(me.organizationId, monday, staffId), listServices(me.organizationId)]);
  const link = (week: string) => `/agenda?semana=${week}${staffId ? `&pessoa=${staffId}` : ""}`;

  return (
    <div className="mt-5 grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={link(addDays(monday, -7))} variant="secondary" size="sm" aria-label="Semana anterior">
          Anterior
        </ButtonLink>
        <ButtonLink href={link(today)} variant="secondary" size="sm">
          Hoje
        </ButtonLink>
        <ButtonLink href={link(addDays(monday, 7))} variant="secondary" size="sm" aria-label="Próxima semana">
          Próxima
        </ButtonLink>
        <p className="text-sm text-text-muted" aria-live="polite">
          {formatDay(monday)} a {formatDay(addDays(monday, 6))}
        </p>
        <div className="w-full sm:ml-auto sm:w-64">
          <StaffFilter members={members} value={staffId} monday={monday} />
        </div>
      </div>
      <AgendaWeek key={`${monday}-${staffId}`} monday={monday} today={today} items={items} members={members} services={services} />
    </div>
  );
}
