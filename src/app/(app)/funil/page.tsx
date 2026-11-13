import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { EmptyState, PageHeader, Skeleton, cx } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { loadFunnel } from "@/lib/labels/funnel";
import { listLabels } from "@/lib/labels/server";
import { SUGGESTED_STAGES, isStage } from "@/lib/labels/stages";
import { FunnelBoard } from "./funnel-board";
import { StageEditor } from "./stage-editor";

export const metadata: Metadata = { title: "Funil" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function FunnelPage({ searchParams }: PageProps<"/funil">) {
  return (
    <div className="flex w-full flex-1 flex-col px-4 pt-6 sm:px-6 lg:h-dvh lg:flex-none lg:overflow-hidden lg:pt-8">
      <Suspense
        fallback={
          <div className="grid gap-4">
            <Skeleton className="h-10 w-40" />
            <div className="flex gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-96 w-72 shrink-0" />
              ))}
            </div>
          </div>
        }
      >
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  await connection();
  const me = await requireMembership();
  const manage = canManage(me.role);
  const labels = await listLabels(me.organizationId);
  const stages = labels.filter(isStage);
  const plain = labels.filter((l) => !isStage(l));
  const filterId = typeof params.etiqueta === "string" && UUID.test(params.etiqueta) && plain.some((l) => l.id === params.etiqueta) ? params.etiqueta : null;
  const editing = params.editar === "1";
  const info = labels.map(({ id, name, color, stagePosition }) => ({ id, name, color, stagePosition }));

  const header = (
    <PageHeader
      title="Funil"
      description="Seus leads por etapa. Arraste o cartão, ou use “Mover para”, quando a pessoa avançar."
      actions={
        manage && stages.length > 0 ? (
          <Link
            href={editing ? "/funil" : "/funil?editar=1"}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium hover:bg-sunken sm:min-h-9"
          >
            {editing ? <Icon name="check" className="size-4" /> : <Icon name="settings" className="size-4" />}
            {editing ? "Pronto" : "Editar etapas"}
          </Link>
        ) : undefined
      }
    />
  );

  if (stages.length === 0) {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-6 pb-10">
        {header}
        <EmptyState
          icon="chart"
          title="Monte as etapas do seu funil"
          description={`Cada etapa é uma etiqueta com lugar no funil. Comece com as sugeridas (${SUGGESTED_STAGES.map((s) => s.name).join(", ")}) e ajuste depois. Na conversa, um toque coloca o contato na etapa.`}
        />
        {manage ? (
          <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-sm ring-1 ring-border/70 sm:p-5">
            <StageEditor stages={info.filter(isStage)} plainLabels={info.filter((l) => !isStage(l))} />
          </div>
        ) : (
          <p className="text-center text-sm text-text-muted">Peça a quem administra o salão para criar as etapas.</p>
        )}
      </div>
    );
  }

  const { funnel, totals } = await loadFunnel(me.organizationId, info, filterId);

  return (
    <>
      {header}
      {editing && manage ? (
        <div className="mt-4 max-w-2xl rounded-[var(--radius-card)] bg-surface p-4 shadow-sm ring-1 ring-border/70 sm:p-5">
          <StageEditor stages={info.filter(isStage)} plainLabels={info.filter((l) => !isStage(l))} />
        </div>
      ) : null}
      {plain.length > 0 ? (
        <nav aria-label="Filtrar por etiqueta" className="-mx-4 mt-4 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6">
          <span className="shrink-0 pr-1 text-xs font-medium text-text-muted">Só quem tem:</span>
          {plain.map((label) => {
            const active = label.id === filterId;
            return (
              <Link
                key={label.id}
                href={active ? "/funil" : `/funil?etiqueta=${label.id}`}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors sm:min-h-8",
                  active ? "text-text" : "border-border bg-surface text-text-muted hover:text-text",
                )}
                style={active ? { backgroundColor: `color-mix(in oklab, ${label.color} 22%, transparent)`, borderColor: label.color } : undefined}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
                {label.name}
                {active ? <Icon name="x" className="size-3.5" /> : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <FunnelBoard key={`${filterId ?? "all"}:${funnel.stages.map((s) => s.id).join(",")}`} stages={funnel.stages} columns={funnel.columns} totals={totals} labels={info} />
      </div>
    </>
  );
}
