import type { NextRequest } from "next/server";
import { canManage, requireMembership } from "@/lib/auth";
import { formatDate } from "@/lib/inbox/format";
import { listTeamMembers } from "@/lib/inbox/queries";
import { toCsv } from "@/lib/reports/csv";
import { parsePreset, periodFor } from "@/lib/reports/period";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** One row per conversation with activity in the period. Holds customer data, so each export is audited. */
export async function GET(request: NextRequest) {
  const me = await requireMembership();
  if (!canManage(me.role)) return new Response("Forbidden", { status: 403 });

  const days = parsePreset(request.nextUrl.searchParams.get("dias"));
  const { from, to } = periodFor(days, new Date());
  const supabase = await createClient();
  const [{ data, error }, members] = await Promise.all([
    supabase.rpc("report_conversations", { p_org: me.organizationId, p_from: from, p_to: to }),
    listTeamMembers(me.organizationId),
  ]);
  if (error) return new Response("Could not build the report", { status: 500 });

  const email = new Map(members.map((m) => [m.id, m.email]));
  const csv = toCsv(
    ["Contato", "Telefone", "Situação", "Responsável", "Departamento", "Motivo de finalização", "Etiquetas", "Primeira mensagem", "Última mensagem", "Recebidas", "Enviadas"],
    data.map((row) => [
      row.contact_name,
      row.phone,
      row.status === "closed" ? "Finalizada" : "Aberta",
      row.assigned_to ? (email.get(row.assigned_to) ?? "Ex-integrante da equipe") : "",
      row.department,
      row.ending,
      row.labels,
      formatDate(row.first_message_at),
      formatDate(row.last_message_at),
      row.received,
      row.sent,
    ]),
  );

  await createAdminClient().from("audit_log").insert({
    organization_id: me.organizationId,
    actor_id: me.user.id,
    action: "report.exported",
    metadata: { from, to, rows: data.length },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fidera-conversas-${from}-a-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
