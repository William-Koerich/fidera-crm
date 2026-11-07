"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { callbackText } from "@/lib/agenda/callbacks";
import { isoToLocal } from "@/lib/agenda/form";
import { listCallbacks } from "@/lib/agenda/queries";
import { requireMembership } from "@/lib/auth";
import { whatsAppLink } from "@/lib/inbox/format";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** The callback as the list shows it now, read under RLS: the form only says which one. */
async function find(formData: FormData) {
  const me = await requireMembership();
  const today = isoToLocal(new Date()).date;
  const callback = (await listCallbacks(me.organizationId, today)).find(
    (c) => c.contactId === formData.get("contactId") && c.serviceId === formData.get("serviceId"),
  );
  return { me, today, callback };
}

async function record(organizationId: string, callback: { contactId: string; serviceId: string; lastVisitAt: string }, status: "called" | "skipped") {
  const supabase = await createClient();
  const { error } = await supabase.from("callbacks").insert({
    organization_id: organizationId,
    contact_id: callback.contactId,
    service_id: callback.serviceId,
    last_visit_at: callback.lastVisitAt,
    status,
  });
  // Someone else on the team already handled it: same outcome.
  if (error && error.code !== "23505") throw new Error(`Could not record the callback (${error.code})`);
}

/** Marks it as called and opens the conversation with the message ready to review. */
export async function callAction(formData: FormData): Promise<void> {
  const { me, today, callback } = await find(formData);
  if (!callback) {
    refresh();
    return;
  }
  await record(me.organizationId, callback, "called");
  const text = callbackText(callback, today);
  if (callback.conversationId) redirect(`/inbox/${callback.conversationId}?texto=${encodeURIComponent(text)}`);
  if (callback.phone) redirect(whatsAppLink(callback.phone, text));
  refresh();
}

export async function skipAction(formData: FormData): Promise<void> {
  const { me, callback } = await find(formData);
  if (callback) await record(me.organizationId, callback, "skipped");
  refresh();
}

/** The client asked not to be called back. Kept in the audit log, since it is about consent. */
export async function doNotContactAction(formData: FormData): Promise<void> {
  const { me, callback } = await find(formData);
  if (!callback) return refresh();
  const supabase = await createClient();
  await supabase.from("contacts").update({ do_not_contact: true }).eq("id", callback.contactId);
  await createAdminClient().from("audit_log").insert({
    organization_id: me.organizationId,
    actor_id: me.user.id,
    action: "contact.do_not_contact",
    target_table: "contacts",
    target_id: callback.contactId,
  });
  refresh();
}
