import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Panel } from "@/components/ui";
import { isAssistantEnabled } from "@/lib/ai/assistant";
import { defaultAgentSettings, type AgentSettings } from "@/lib/ai/agent/config";
import { canManage, requireMembership } from "@/lib/auth";
import { listInboxOptions } from "@/lib/inbox/queries";
import { createClient } from "@/lib/supabase/server";
import { ManagersOnly, SettingsPage } from "../settings-page";
import { AgentForm } from "./agent-form";

export const metadata: Metadata = { title: "Atendente com IA" };

export default function Page() {
  return (
    <SettingsPage
      title="Atendente com IA"
      description="Responde os clientes sozinha no WhatsApp e no chat do site, consulta os horários livres e agenda. Sai da conversa quando alguém da equipe escreve, e chama a equipe quando não souber ajudar. Tudo o que ela faz fica anotado na conversa."
    >
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  if (!canManage(me.role)) return <ManagersOnly />;
  const supabase = await createClient();
  const [row, hours, services, options] = await Promise.all([
    supabase.from("ai_agent_settings").select("*").eq("organization_id", me.organizationId).maybeSingle(),
    supabase.from("auto_reply_settings").select("business_hours").eq("organization_id", me.organizationId).maybeSingle(),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("organization_id", me.organizationId),
    listInboxOptions(me.organizationId),
  ]);
  const settings: AgentSettings = row.data
    ? {
        enabled: row.data.enabled,
        instructions: row.data.instructions,
        mode: row.data.mode === "outside_hours" ? "outside_hours" : "always",
        canBook: row.data.can_book,
        canCancel: row.data.can_cancel,
        pauseAfterTeamHours: row.data.pause_after_team_hours,
        handoffDepartmentId: row.data.handoff_department_id,
      }
    : defaultAgentSettings();
  const hasHours = Object.keys((hours.data?.business_hours ?? {}) as object).length > 0;
  const hasServices = (services.count ?? 0) > 0;

  return (
    <div className="grid gap-4">
      {!isAssistantEnabled() ? (
        <Alert tone="warning" title="A IA está desligada no servidor">
          Falta a chave da Anthropic (ANTHROPIC_API_KEY) nas variáveis do servidor. Dá para salvar as instruções agora; a IA começa a
          responder quando a chave estiver lá.
        </Alert>
      ) : null}
      {!hasHours || !hasServices ? (
        <Alert tone="warning" title="Para a IA agendar, faltam informações">
          <ul className="mt-1 list-disc pl-5">
            {!hasHours ? (
              <li>
                Marque o horário de atendimento em <Link href="/settings/respostas-automaticas">Respostas automáticas</Link>.
              </li>
            ) : null}
            {!hasServices ? (
              <li>
                Cadastre os <Link href="/settings/servicos">Serviços</Link>, com a duração de cada um.
              </li>
            ) : null}
          </ul>
        </Alert>
      ) : null}
      <Alert tone="info" title="Com a IA ligada, o robô de menu e as respostas automáticas ficam desligados">
        Ela cumprimenta, responde fora do horário e agenda no lugar deles. Cada mensagem respondida é cobrada pela Anthropic, de
        acordo com o tamanho da conversa.
      </Alert>
      <Panel>
        <AgentForm settings={settings} departments={options.departments} />
      </Panel>
    </div>
  );
}
