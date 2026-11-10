import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { isoToLocal, validDay, weekStart } from "@/lib/agenda/form";
import { listServices, listWeekAppointments } from "@/lib/agenda/queries";
import { requireMembership } from "@/lib/auth";
import { listTeamMembers } from "@/lib/inbox/queries";
import type { BusinessHours } from "@/lib/replies/auto-reply";
import { createAdminClient } from "@/lib/supabase/server";
import { AgendaCalendar, type AgendaView } from "./agenda-calendar";

export const metadata: Metadata = { title: "Agenda" };

export default function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  return (
    // The grid scrolls inside: the toolbar and day names stay in view, like a paper planner.
    <div className="mx-auto flex h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] w-full max-w-[1600px] flex-col px-3 pt-4 pb-3 sm:px-6 lg:h-dvh lg:pt-6 lg:pb-6">
      <Suspense fallback={<Skeleton className="h-full" />}>
        <Calendar searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function parseDate(raw: unknown): string | null {
  const parts = typeof raw === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) : null;
  return parts ? validDay(Number(parts[1]), Number(parts[2]), Number(parts[3])) : null;
}

async function Calendar({ searchParams }: { searchParams: PageProps<"/agenda">["searchParams"] }) {
  const params = await searchParams;
  await connection();
  const me = await requireMembership();
  const today = isoToLocal(new Date()).date;
  // `semana` is the old address, kept so saved links still open.
  const day = parseDate(params.dia) ?? parseDate(params.semana) ?? today;
  const view: AgendaView | null = params.visao === "dia" || params.visao === "semana" ? params.visao : null;
  const members = await listTeamMembers(me.organizationId);
  const staffId = members.find((m) => m.id === params.pessoa)?.id ?? null;
  const [items, services, hours] = await Promise.all([
    listWeekAppointments(me.organizationId, weekStart(day), staffId),
    listServices(me.organizationId),
    // Opening hours shade the grid for everyone; only managers may read the reply settings themselves.
    createAdminClient().from("auto_reply_settings").select("business_hours").eq("organization_id", me.organizationId).maybeSingle(),
  ]);

  return (
    <AgendaCalendar
      key={`${weekStart(day)}-${staffId}`}
      day={day}
      today={today}
      view={view}
      staffId={staffId}
      items={items}
      members={members}
      services={services}
      businessHours={(hours.data?.business_hours ?? {}) as unknown as BusinessHours}
    />
  );
}
