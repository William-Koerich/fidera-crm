import type { Metadata } from "next";
import { Suspense } from "react";
import { Alert, Panel, Skeleton } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { canManage, requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { getAutoReplySettings, listQuickReplies } from "@/lib/replies/queries";
import { deleteQuickReplyAction } from "./actions";
import { AutoReplyForm } from "./auto-reply-form";
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
  const [replies, autoReplies] = await Promise.all([
    listQuickReplies(me.organizationId),
    manage ? getAutoReplySettings(me.organizationId) : null,
  ]);

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
                máximo 30 por hora neste negócio.
              </Alert>
            ) : null}
            <AutoReplyForm settings={autoReplies} />
          </div>
        </Panel>
      ) : null}
    </>
  );
}
