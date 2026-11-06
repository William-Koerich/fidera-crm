import type { NextRequest } from "next/server";
import { canManage, requireMembership } from "@/lib/auth";
import { getProviderByName } from "@/lib/channels";
import { listChannelAccounts } from "@/lib/inbox/queries";
import { guardCsvText } from "@/lib/reports/csv";
import { parseDay } from "@/lib/reports/period";
import { createAdminClient } from "@/lib/supabase/server";

/** ChatPro's own history for a day. Goes through the server so its key never reaches the browser. */
export async function GET(request: NextRequest) {
  const me = await requireMembership();
  if (!canManage(me.role)) return new Response("Forbidden", { status: 403 });
  const day = parseDay(request.nextUrl.searchParams.get("dia"));
  if (!day) return new Response("Invalid day", { status: 400 });

  const accounts = await listChannelAccounts(me.organizationId);
  for (const account of accounts) {
    const download = getProviderByName(account.provider).team?.downloadDayReport;
    if (!download) continue;
    const { data } = await createAdminClient()
      .from("channel_accounts")
      .select("external_account_id")
      .eq("id", account.id)
      .eq("organization_id", me.organizationId)
      .single();
    if (!data) continue;
    const csv = await getProviderByName(account.provider).team!.downloadDayReport!(data.external_account_id, day);
    if (csv === null) return new Response("ChatPro did not answer", { status: 502 });

    await createAdminClient().from("audit_log").insert({
      organization_id: me.organizationId,
      actor_id: me.user.id,
      action: "report.exported",
      metadata: { from: day, to: day, source: "chatpro" },
    });
    return new Response(guardCsvText(csv), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="chatpro-atendimentos-${day}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response("No channel with a report", { status: 404 });
}
