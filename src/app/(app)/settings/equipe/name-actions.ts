"use server";

import { refresh } from "next/cache";
import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Names a person on the team. The database checks who may: themselves, or an owner or admin. */
export async function setMemberNameAction(memberId: string, name: string): Promise<{ ok: boolean; message?: string }> {
  const me = await requireMembership();
  const cleaned = name.trim();
  if (cleaned.length > 60) return { ok: false, message: "Use até 60 letras." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_name", { org_id: me.organizationId, member_id: memberId, new_name: cleaned });
  if (error) return { ok: false, message: error.code === "42501" ? "Você não pode mudar o nome desta pessoa." : "Não foi possível salvar. Tente de novo." };
  refresh();
  return { ok: true };
}
