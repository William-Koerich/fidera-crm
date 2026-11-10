"use server";

import { refresh } from "next/cache";
import { parseAgentForm } from "@/lib/ai/agent/config";
import { canManage, requireMembership } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export interface AgentFormState {
  status: "idle" | "error" | "saved";
  message?: string;
  savedAt?: number;
}

const fail = (message: string): AgentFormState => ({ status: "error", message });

export async function saveAgentAction(_prev: AgentFormState, formData: FormData): Promise<AgentFormState> {
  const me = await requireMembership();
  if (!canManage(me.role)) return fail("Apenas donos e administradores podem alterar a IA.");
  const parsed = parseAgentForm((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
  if (!parsed.ok) return fail(parsed.message);
  const { settings } = parsed;

  const supabase = await createClient();
  if (settings.handoffDepartmentId) {
    const { data } = await supabase
      .from("departments")
      .select("id")
      .eq("organization_id", me.organizationId)
      .eq("id", settings.handoffDepartmentId)
      .maybeSingle();
    if (!data) return fail("Esse departamento não existe mais. Escolha outro.");
  }
  const { error } = await supabase.from("ai_agent_settings").upsert({
    organization_id: me.organizationId,
    enabled: settings.enabled,
    instructions: settings.instructions,
    mode: settings.mode,
    can_book: settings.canBook,
    can_cancel: settings.canCancel,
    pause_after_team_hours: settings.pauseAfterTeamHours,
    handoff_department_id: settings.handoffDepartmentId,
  });
  if (error) return fail("Não foi possível salvar. Tente de novo.");
  await createAdminClient().from("audit_log").insert({
    organization_id: me.organizationId,
    actor_id: me.user.id,
    action: "ai_agent.updated",
    metadata: { enabled: settings.enabled, mode: settings.mode, canBook: settings.canBook, canCancel: settings.canCancel },
  });
  refresh();
  return { status: "saved", savedAt: Date.now() };
}
