"use server";

import { refresh } from "next/cache";
import { APPOINTMENT_STATUSES, isoToLocal, parseAppointmentForm, type AppointmentStatus, type SavedAppointment } from "@/lib/agenda/form";
import { requireMembership } from "@/lib/auth";
import { getConversation, listTeamMembers } from "@/lib/inbox/queries";
import { createClient } from "@/lib/supabase/server";

export interface AppointmentFormState {
  status: "idle" | "saved" | "error";
  message?: string;
  savedAt?: number;
  saved?: SavedAppointment;
}

const fail = (message: string): AppointmentFormState => ({ status: "error", message });
const OVERLAP = "23P01";
const OVERLAP_MESSAGE = "Esta pessoa já tem um cliente nesse horário. Escolha outro horário ou outra pessoa.";

export async function saveAppointmentAction(_prev: AppointmentFormState, formData: FormData): Promise<AppointmentFormState> {
  const me = await requireMembership();
  const parsed = parseAppointmentForm((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
  if (!parsed.ok) return fail(parsed.message);
  const { values } = parsed;

  if (values.staffId) {
    const members = await listTeamMembers(me.organizationId);
    if (!members.some((m) => m.id === values.staffId)) return fail("Esta pessoa não faz parte da equipe.");
  }

  const fields = {
    client_name: values.clientName,
    service: values.service,
    notes: values.notes,
    staff_id: values.staffId,
    starts_at: values.startsAt,
    ends_at: values.endsAt,
  };
  const supabase = await createClient();
  const id = String(formData.get("appointmentId") ?? "");

  if (id) {
    const { error } = await supabase.from("appointments").update(fields).eq("id", id).eq("organization_id", me.organizationId);
    if (error?.code === OVERLAP) return fail(OVERLAP_MESSAGE);
    if (error) return fail("Não foi possível salvar. Tente de novo.");
  } else {
    // The contact comes from the conversation, read under RLS, never from the form.
    const conversationId = String(formData.get("conversationId") ?? "");
    const conversation = conversationId ? await getConversation(conversationId) : null;
    if (conversationId && !conversation) return fail("Conversa não encontrada.");
    const { error } = await supabase.from("appointments").insert({
      ...fields,
      organization_id: conversation?.organizationId ?? me.organizationId,
      conversation_id: conversation?.id ?? null,
      contact_id: conversation?.contact.id ?? null,
      created_by: me.user.id,
    });
    if (error?.code === OVERLAP) return fail(OVERLAP_MESSAGE);
    if (error) return fail("Não foi possível salvar. Tente de novo.");
  }
  refresh();
  return {
    status: "saved",
    savedAt: Date.now(),
    saved: { clientName: values.clientName, ...isoToLocal(values.startsAt), service: values.service },
  };
}

export async function setAppointmentStatusAction(id: string, status: AppointmentStatus): Promise<{ ok: boolean; message?: string }> {
  const me = await requireMembership();
  if (!APPOINTMENT_STATUSES.includes(status)) return { ok: false, message: "Situação inválida." };
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").update({ status }).eq("id", id).eq("organization_id", me.organizationId);
  if (error?.code === OVERLAP) return { ok: false, message: OVERLAP_MESSAGE };
  if (error) return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  refresh();
  return { ok: true };
}
