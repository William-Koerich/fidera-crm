import type { Metadata } from "next";
import { Suspense } from "react";
import { Alert, Panel, Skeleton } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { canManage, requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { listInboxOptions } from "@/lib/inbox/queries";
import { getAutoReplySettings, getBotSettings, getNpsSettings, listQuickReplies } from "@/lib/replies/queries";
import { deleteQuickReplyAction } from "./actions";
import { AutoReplyForm } from "./auto-reply-form";
import { BotForm } from "./bot-form";
import { NpsForm } from "./nps-form";
import { QuickReplyForm } from "./quick-reply-form";

export const metadata: Metadata = { title: "Respostas" };

export default function RepliesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Replies />
    </Suspense>
  );
}

async function Replies() {
  const me = await requireMembership();
  const manage = canManage(me.role);
  const [replies, autoReplies, nps, bot, options] = await Promise.all([
    listQuickReplies(me.organizationId),
    manage ? getAutoReplySettings(me.organizationId) : null,
    manage ? getNpsSettings(me.organizationId) : null,
    manage ? getBotSettings(me.organizationId) : null,
    manage ? listInboxOptions(me.organizationId) : null,
  ]);
  const bookingOption = bot?.settings.options.some((o) => o.action === "book");

  return (
    <>
      <Panel
        title="Respostas rápidas"
        description="Textos prontos para a equipe. Na inbox, digite / na caixa de mensagem e escolha um. Você ainda pode editar antes de enviar."
      >
        <div className="grid gap-5">
          {replies.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {replies.map((r) => (
                <li key={r.id} className="grid gap-3 px-4 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">/{r.shortcut}</p>
                      <p className="mt-0.5 line-clamp-3 text-sm break-words whitespace-pre-wrap text-text-muted">{r.body}</p>
                    </div>
                    {manage ? (
                      <ConfirmDialog
                        trigger="Excluir"
                        title={`Excluir /${r.shortcut}?`}
                        description="O atalho deixa de aparecer na inbox. Mensagens já enviadas não mudam."
                        confirmLabel="Excluir resposta"
                        action={deleteQuickReplyAction}
                        fields={{ id: r.id }}
                      />
                    ) : null}
                  </div>
                  {manage ? (
                    <details>
                      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-info sm:min-h-0">
                        Editar
                      </summary>
                      <div className="mt-3">
                        <QuickReplyForm reply={r} />
                      </div>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">Nenhuma resposta rápida cadastrada ainda.</p>
          )}

          {manage ? (
            <div className="border-t border-border pt-5">
              <h3 className="mb-3 text-sm font-medium">Nova resposta</h3>
              <QuickReplyForm />
            </div>
          ) : (
            <p className="text-sm text-text-muted">Apenas donos e administradores podem alterar respostas.</p>
          )}
        </div>
      </Panel>

      {autoReplies ? (
        <Panel
          title="Respostas automáticas"
          description="O Fidera responde sozinho e a conversa continua aguardando a resposta da equipe. Grupos, importações e mensagens enviadas pelo celular nunca disparam uma resposta automática."
        >
          <div className="grid gap-4">
            {getWhatsAppProviderName() === "chatpro" ? (
              <Alert tone="warning" title="Cuidado com o número conectado por QR Code">
                Mensagens automáticas aumentam o risco de o WhatsApp restringir ou bloquear o número. Por isso o Fidera envia no
                máximo 60 por hora neste negócio, somando respostas automáticas, avaliações e robô.
              </Alert>
            ) : null}
            <AutoReplyForm settings={autoReplies} />
          </div>
        </Panel>
      ) : null}

      {bot && options ? (
        <Panel
          title="Robô de atendimento"
          description="Responde com um menu numerado quando um cliente chama depois de 12 horas sem conversa. Agenda horários livres, responde dúvidas e passa para a equipe. Sai da conversa assim que alguém da equipe responde. Enquanto estiver ligado, a saudação e o aviso de fora do horário não são enviados."
        >
          <div className="grid gap-4">
            {getWhatsAppProviderName() === "chatpro" ? (
              <Alert tone="warning" title="Mais mensagens automáticas no número conectado por QR Code">
                Um agendamento pelo robô troca cerca de cinco mensagens. Ele para sozinho se o limite por hora for atingido, e a conversa
                fica esperando a equipe.
              </Alert>
            ) : null}
            {bookingOption && (!bot.hasBusinessHours || bot.serviceCount === 0) ? (
              <Alert tone="warning" title="O agendamento ainda não tem horários para oferecer">
                {!bot.hasBusinessHours ? "Marque o horário de atendimento em Respostas automáticas, acima. " : ""}
                {bot.serviceCount === 0 ? "Cadastre os serviços em Ajustes, na aba Atendimento. " : ""}
                Sem isso, o robô passa a conversa para a equipe.
              </Alert>
            ) : null}
            <BotForm settings={bot.settings} departments={options.departments} members={bot.members} />
          </div>
        </Panel>
      ) : null}

      {nps ? (
        <Panel
          title="Avaliação do atendimento"
          description="Pede uma nota ao finalizar uma conversa. Cada cliente recebe no máximo uma a cada 30 dias, e dá para desmarcar ao finalizar. O resultado fica em Relatórios."
        >
          <NpsForm enabled={nps.enabled} question={nps.question} thanks={nps.thanks} />
        </Panel>
      ) : null}
    </>
  );
}
