import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, isoToLocal, localDateTimeToIso, type AppointmentStatus, type ServiceOption } from "./form";

export interface AppointmentItem {
  id: string;
  clientName: string;
  service: string | null;
  notes: string | null;
  staffId: string | null;
  conversationId: string | null;
  status: AppointmentStatus;
  date: string;
  time: string;
  durationMinutes: number;
}

type Row = {
  id: string;
  client_name: string;
  service: string | null;
  notes: string | null;
  staff_id: string | null;
  conversation_id: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
};

const COLUMNS = "id, client_name, service, notes, staff_id, conversation_id, status, starts_at, ends_at";

const toItem = (row: Row): AppointmentItem => ({
  id: row.id,
  clientName: row.client_name,
  service: row.service,
  notes: row.notes,
  staffId: row.staff_id,
  conversationId: row.conversation_id,
  status: row.status as AppointmentStatus,
  ...isoToLocal(row.starts_at),
  durationMinutes: Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60_000),
});

/** The week's appointments, cancelled ones left out. */
export async function listWeekAppointments(organizationId: string, monday: string, staffId: string | null): Promise<AppointmentItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("appointments")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .neq("status", "cancelled")
    .gte("starts_at", localDateTimeToIso(monday, "00:00"))
    .lt("starts_at", localDateTimeToIso(addDays(monday, 7), "00:00"))
    .order("starts_at");
  if (staffId) query = query.eq("staff_id", staffId);
  const { data, error } = await query.limit(1000);
  if (error) throw new Error(`Could not load the agenda (${error.code})`);
  return data.map(toItem);
}

/** What this client has coming up, shown beside the conversation. */
export async function listUpcomingForContact(contactId: string): Promise<AppointmentItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(COLUMNS)
    .eq("contact_id", contactId)
    .eq("status", "scheduled")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(5);
  if (error) throw new Error(`Could not load appointments (${error.code})`);
  return data.map(toItem);
}

export async function listServices(organizationId: string): Promise<ServiceOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, name, duration_minutes")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) throw new Error(`Could not load the services (${error.code})`);
  return data.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.duration_minutes }));
}
