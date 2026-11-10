import type { Metadata } from "next";
import { Alert, Panel } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { getAutoReplySettings, getBotSettings } from "@/lib/replies/queries";
import { AutoReplyForm } from "../respostas/auto-reply-form";
import { AgentOnNotice } from "../agent-on-notice";
import { ManagersOnly, SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "Respostas automáticas" };

export default function Page() {
  return (
    <SettingsPage
      title="Respostas automáticas"
      description="O Fidera responde sozinho, e a conversa continua aguardando a equipe. Aqui também fica o horário de atendimento, que o robô usa para oferecer horários."
    >
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  if (!canManage(me.role)) return <ManagersOnly />;
  const [settings, bot] = await Promise.all([getAutoReplySettings(me.organizationId), getBotSettings(me.organizationId)]);
  return (
    <div className="grid gap-4">
      <AgentOnNotice organizationId={me.organizationId} what="A saudação e o aviso de fora do horário" />
      {bot.settings.enabled ? (
        <Alert tone="info" title="O robô está ligado">
          Enquanto ele estiver ligado, a saudação e o aviso de fora do horário não são enviados. O horário de atendimento continua valendo
          para o robô.
        </Alert>
      ) : null}
      {getWhatsAppProviderName() === "chatpro" ? (
        <Alert tone="warning" title="Cuidado com o número conectado por QR Code">
          Mensagens automáticas aumentam o risco de o WhatsApp restringir ou bloquear o número. Por isso o Fidera envia no máximo 60 por
          hora neste negócio, somando respostas automáticas, avaliações, robô e IA.
        </Alert>
      ) : null}
      <Panel>
        <AutoReplyForm settings={settings} />
      </Panel>
    </div>
  );
}
