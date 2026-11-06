import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface DayTotals {
  day: string;
  attendances: number;
  inbound: number;
  outbound: number;
}

export interface ReportSummary {
  by_day: DayTotals[];
  automatic: number;
  responses: number;
  median_response_seconds: number | null;
  new_contacts: number;
  closed: number;
  waiting_now: number;
  by_assignee: { user_id: string | null; conversations: number }[];
  by_ending: { name: string; conversations: number }[];
  by_department: { name: string; conversations: number }[];
}

/** For owners and admins: the database refuses anyone else. */
export async function getReportSummary(organizationId: string, from: string, to: string): Promise<ReportSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_summary", { p_org: organizationId, p_from: from, p_to: to });
  if (error) throw new Error(`Could not load the report (${error.code})`);
  return data as unknown as ReportSummary;
}

export interface NpsReport {
  sent: number;
  answered: number;
  promoters: number;
  passives: number;
  detractors: number;
  by_assignee: { user_id: string | null; answered: number; promoters: number; detractors: number }[];
}

export async function getNpsReport(organizationId: string, from: string, to: string): Promise<NpsReport> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_nps", { p_org: organizationId, p_from: from, p_to: to });
  if (error) throw new Error(`Could not load the ratings (${error.code})`);
  return data as unknown as NpsReport;
}
