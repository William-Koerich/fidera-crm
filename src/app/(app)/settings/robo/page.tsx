import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Panel } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { listInboxOptions } from "@/lib/inbox/queries";
import { getBotSettings } from "@/lib/replies/queries";
import { BotForm } from "../respostas/bot-form";
import { ManagersOnly, SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "Robô de atendimento" };

export default function Page() {
  return (
    <SettingsPage
      title="Robô de atendimento"
      description="Responde com um menu numerado quando um cliente chama depois de 12 horas sem conversa. Agenda horários livres, responde dúvidas e passa para a equipe, e sai da conversa assim que alguém da equipe responde."
    >
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  if (!canManage(me.role)) return <ManagersOnly />;
  const [bot, options] = await Promise.all([getBotSettings(me.organizationId), listInboxOptions(me.organizationId)]);
  const booking = bot.settings.options.length === 0 || bot.settings.options.some((o) => o.action === "book");
  return (
    <div className="grid gap-4">
      {booking && (!bot.hasBusinessHours || bot.serviceCount === 0) ? (
        <Alert tone="warning" title="O agendamento ainda não tem horários para oferecer">
          <ul className="mt-1 list-disc pl-5">
            {!bot.hasBusinessHours ? (
              <li>
                Marque o horário de atendimento em <Link href="/settings/respostas-automaticas">Respostas automáticas</Link>.
              </li>
            ) : null}
            {bot.serviceCount === 0 ? (
              <li>
                Cadastre os <Link href="/settings/servicos">Serviços</Link>, com a duração de cada um.
              </li>
            ) : null}
          </ul>
          Sem isso, quem escolhe agendar é passado para a equipe.
        </Alert>
      ) : null}
      {getWhatsAppProviderName() === "chatpro" ? (
        <Alert tone="warning" title="Mais mensagens automáticas no número conectado por QR Code">
          Um agendamento pelo robô troca cerca de cinco mensagens. Ele para sozinho se o limite por hora for atingido, e a conversa fica
          esperando a equipe.
        </Alert>
      ) : null}
      <Panel>
        <BotForm settings={bot.settings} departments={options.departments} members={bot.members} />
      </Panel>
    </div>
  );
}
