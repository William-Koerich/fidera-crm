import type { Metadata } from "next";
import { Alert, Panel } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { getAutoReplySettings, getBotSettings } from "@/lib/replies/queries";
import { isGreetingAudioPathOf } from "@/lib/replies/greeting-audio";
import { createAdminClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/webhooks/media";
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
  // The recording is private: the page gets a short-lived address to play it.
  const audioPath = settings.greetingAudioPath;
  const greetingAudioUrl =
    audioPath && isGreetingAudioPathOf(audioPath, me.organizationId)
      ? ((await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUrl(audioPath, 3600)).data?.signedUrl ?? null)
      : null;
  return (
    <div className="grid gap-4">
      <AgentOnNotice
        organizationId={me.organizationId}
        what="O aviso de fora do horário"
        note="A saudação continua: ela vai no primeiro contato, e a IA responde logo depois."
      />
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
        <AutoReplyForm settings={settings} greetingAudioUrl={greetingAudioUrl} />
      </Panel>
    </div>
  );
}
