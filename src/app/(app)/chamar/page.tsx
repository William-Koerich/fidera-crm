import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Avatar, Button, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { dueLabel, lastVisitLabel } from "@/lib/agenda/callbacks";
import { isoToLocal } from "@/lib/agenda/form";
import { listCallbacks, listServices } from "@/lib/agenda/queries";
import { canManage, requireMembership } from "@/lib/auth";
import { formatPhone } from "@/lib/inbox/format";
import { callAction, doNotContactAction, skipAction } from "./actions";

export const metadata: Metadata = { title: "Chamar hoje" };

export default function CallTodayPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <PageHeader title="Chamar hoje" description="Clientes que já passaram do prazo de voltar e ainda não têm horário marcado." />
      <Suspense fallback={<Skeleton className="mt-6 h-96" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  await connection();
  const me = await requireMembership();
  const today = isoToLocal(new Date()).date;
  const [callbacks, services] = await Promise.all([listCallbacks(me.organizationId, today), listServices(me.organizationId)]);

  if (!services.some((s) => s.returnAfterDays)) {
    return (
      <EmptyState
        className="mt-6"
        icon="clock"
        title="Defina quando cada serviço deve voltar"
        description="Em Ajustes, em Serviços, informe o prazo de retorno de cada um, como corte a cada 30 dias. Quem tiver um atendimento concluído na Agenda e passar do prazo aparece aqui."
        action={canManage(me.role) ? <Link href="/settings/servicos" className="text-sm font-medium text-info hover:underline">Abrir Serviços</Link> : undefined}
      />
    );
  }
  if (callbacks.length === 0) {
    return (
      <EmptyState
        className="mt-6"
        icon="check"
        title="Ninguém para chamar hoje"
        description="A lista usa os atendimentos marcados como Concluído na Agenda. Marque os que acontecerem para ela se formar."
      />
    );
  }

  return (
    <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
      {callbacks.map((c) => {
        const name = c.contactName || formatPhone(c.phone) || "Cliente";
        const fields = (
          <>
            <input type="hidden" name="contactId" value={c.contactId} />
            <input type="hidden" name="serviceId" value={c.serviceId} />
          </>
        );
        return (
          <li key={`${c.contactId}-${c.serviceId}`} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={c.contactName} phone={c.phone} />
              <div className="min-w-0">
                <p className="truncate font-medium">{name}</p>
                <p className="truncate text-sm text-text-muted">
                  {c.serviceName} · {lastVisitLabel(c.lastVisitOn)}
                </p>
                <p className="text-sm font-medium text-warning">{dueLabel(c.dueOn, today)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.conversationId || c.phone ? (
                <form action={callAction}>
                  {fields}
                  <Button type="submit">Chamar</Button>
                </form>
              ) : null}
              <form action={skipAction}>
                {fields}
                <Button type="submit" variant="secondary">
                  Pular
                </Button>
              </form>
              <ConfirmDialog
                trigger="Não chamar mais"
                title={`Não chamar mais ${name}?`}
                description="A pessoa sai desta lista para sempre, em todos os serviços. Use quando ela pedir para não receber esse tipo de mensagem."
                confirmLabel="Não chamar mais"
                action={doNotContactAction}
                fields={{ contactId: c.contactId, serviceId: c.serviceId }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
