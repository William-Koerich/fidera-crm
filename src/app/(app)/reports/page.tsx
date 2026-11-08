import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Alert, ButtonAnchor, PageHeader, Panel, Skeleton, TabLinks } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { getProviderByName } from "@/lib/channels";
import { listChannelAccounts, listTeamMembers } from "@/lib/inbox/queries";
import { PERIOD_PRESETS, chartBuckets, formatDuration, monthlyPace, parsePreset, periodFor } from "@/lib/reports/period";
import { getNpsReport, getReportSummary } from "@/lib/reports/queries";
import { npsScore } from "@/lib/replies/nps";
import { DailyBars } from "./daily-bars";

export const metadata: Metadata = { title: "Relatórios" };

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      <PageHeader title="Relatórios" description="O volume de atendimento e como a equipe está respondendo." />
      <Suspense fallback={<Skeleton className="mt-6 h-96" />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-medium tracking-[-0.02em] tabular">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-text-muted">{note}</p> : null}
    </div>
  );
}

function Breakdown({ title, rows, empty }: { title: string; rows: { name: string; conversations: number }[]; empty: string }) {
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">Conversas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="max-w-0 truncate py-2 pr-4">{row.name}</td>
                <td className="w-16 py-2 text-right tabular">{row.conversations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

async function Report({ searchParams }: { searchParams: PageProps<"/reports">["searchParams"] }) {
  const params = await searchParams;
  await connection();
  const me = await requireMembership();
  if (!canManage(me.role)) {
    return (
      <Alert tone="info" title="Só para donos e administradores" className="mt-6">
        Peça a quem administra o negócio para ver os relatórios.
      </Alert>
    );
  }

  const days = parsePreset(params.dias);
  const { from, to } = periodFor(days, new Date());
  const [report, nps, members, accounts] = await Promise.all([
    getReportSummary(me.organizationId, from, to),
    getNpsReport(me.organizationId, from, to),
    listTeamMembers(me.organizationId),
    listChannelAccounts(me.organizationId),
  ]);

  const attendances = report.by_day.reduce((sum, d) => sum + d.attendances, 0);
  const inbound = report.by_day.reduce((sum, d) => sum + d.inbound, 0);
  const outbound = report.by_day.reduce((sum, d) => sum + d.outbound, 0);
  const assignees = report.by_assignee.map((a) => ({
    name: a.user_id ? (members.find((m) => m.id === a.user_id)?.email ?? "Ex-integrante da equipe") : "Sem responsável",
    conversations: a.conversations,
  }));
  const chart = chartBuckets(report.by_day);
  const score = npsScore(nps);
  const hasChannelReport = accounts.some((a) => getProviderByName(a.provider).team?.downloadDayReport);

  return (
    <div className="mt-5 grid gap-6">
      <TabLinks
        label="Período do relatório"
        active={String(days)}
        items={PERIOD_PRESETS.map((p) => ({ key: String(p), label: `${p} dias`, href: `/reports?dias=${p}` }))}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Atendimentos" value={String(attendances)} note={`Cerca de ${monthlyPace(attendances, days)} por mês neste ritmo`} />
        <Stat
          label="Primeira resposta"
          value={report.median_response_seconds === null ? "Sem dados" : formatDuration(report.median_response_seconds)}
          note={report.responses > 0 ? `Mediana de ${report.responses} ${report.responses === 1 ? "resposta" : "respostas"}` : undefined}
        />
        <Stat label="Aguardando agora" value={String(report.waiting_now)} note="Conversas abertas sem resposta" />
        <Stat label="Novos contatos" value={String(report.new_contacts)} />
        <Stat label="Mensagens" value={`${inbound} / ${outbound}`} note="Recebidas / enviadas pela equipe" />
        <Stat label="Automáticas" value={String(report.automatic)} note="Saudação e fora do horário" />
      </div>

      <Panel title={`Atendimentos por ${chart.unit}`} description="Um atendimento é um cliente que escreve, contado uma vez a cada 24 horas, como no ChatPro.">
        <div className="grid gap-4">
          <DailyBars buckets={chart.buckets} unit={chart.unit} />
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-info sm:min-h-0">Ver como tabela</summary>
            <div className="mt-2 max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface text-left text-text-muted">
                  <tr>
                    <th scope="col" className="py-1.5 font-medium">Dia</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Atendimentos</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Recebidas</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Enviadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular">
                  {report.by_day.map((d) => (
                    <tr key={d.day}>
                      <td className="py-1.5">{`${d.day.slice(8, 10)}/${d.day.slice(5, 7)}`}</td>
                      <td className="py-1.5 text-right">{d.attendances}</td>
                      <td className="py-1.5 text-right">{d.inbound}</td>
                      <td className="py-1.5 text-right">{d.outbound}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Breakdown title="Conversas por responsável" rows={assignees} empty="Nenhuma conversa no período." />
        <Breakdown title="Conversas por departamento" rows={report.by_department} empty="Nenhuma conversa no período." />
        <Breakdown title={`Finalizadas por motivo (${report.closed})`} rows={report.by_ending} empty="Nenhuma conversa finalizada no período." />
      </div>

      <Panel
        title="Avaliação do atendimento"
        description="NPS: a parcela que deu 9 ou 10 menos a que deu de 0 a 6. Vai de -100 a 100. Poucas respostas dizem pouco."
      >
        {nps.sent === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma avaliação enviada no período. Ligue em Ajustes, em Avaliação do atendimento.</p>
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat label="NPS" value={score === null ? "Sem dados" : String(score)} />
              <Stat label="Respostas" value={`${nps.answered} de ${nps.sent}`} note="Avaliações respondidas e enviadas" />
              <Stat label="Notas" value={`${nps.promoters} / ${nps.passives} / ${nps.detractors}`} note="9 e 10 / 7 e 8 / 0 a 6" />
            </div>
            {nps.by_assignee.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-left text-text-muted">
                  <tr>
                    <th scope="col" className="py-1.5 font-medium">Quem atendeu</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Respostas</th>
                    <th scope="col" className="py-1.5 text-right font-medium">NPS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular">
                  {nps.by_assignee.map((row) => (
                    <tr key={row.user_id ?? "none"}>
                      <td className="max-w-0 truncate py-1.5 pr-4">
                        {row.user_id ? (members.find((m) => m.id === row.user_id)?.email ?? "Ex-integrante da equipe") : "Sem responsável"}
                      </td>
                      <td className="w-20 py-1.5 text-right">{row.answered}</td>
                      <td className="w-16 py-1.5 text-right">{npsScore(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel title="Exportar" description="Os arquivos abrem direto no Excel e contêm dados de clientes: guarde com cuidado.">
        <div className="grid gap-3 sm:flex sm:flex-wrap">
          <ButtonAnchor href={`/api/reports/export?dias=${days}`} variant="secondary">
            Baixar conversas destes {days} dias
          </ButtonAnchor>
          {hasChannelReport ? (
            <ButtonAnchor href={`/api/reports/chatpro?dia=${to}`} variant="secondary">
              Baixar relatório do ChatPro de hoje
            </ButtonAnchor>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
