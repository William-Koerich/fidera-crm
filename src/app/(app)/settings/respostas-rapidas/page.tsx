import type { Metadata } from "next";
import { Panel } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { canManage, requireMembership } from "@/lib/auth";
import { listQuickReplies } from "@/lib/replies/queries";
import { deleteQuickReplyAction } from "../respostas/actions";
import { QuickReplyForm } from "../respostas/quick-reply-form";
import { ManagersOnly, SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "Respostas rápidas" };

export default function Page() {
  return (
    <SettingsPage
      title="Respostas rápidas"
      description="Textos prontos para a equipe. Na conversa, digite / na caixa de mensagem e escolha um. Dá para editar antes de enviar."
    >
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  const manage = canManage(me.role);
  const replies = await listQuickReplies(me.organizationId);
  return (
    <div className="grid gap-6">
      <Panel>
        {replies.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {replies.map((r) => (
              <li key={r.id} className="grid gap-3 px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-brand">/{r.shortcut}</p>
                    <p className="mt-0.5 line-clamp-3 text-sm break-words whitespace-pre-wrap text-text-muted">{r.body}</p>
                  </div>
                  {manage ? (
                    <ConfirmDialog
                      trigger="Excluir"
                      title={`Excluir /${r.shortcut}?`}
                      description="O atalho deixa de aparecer na conversa. Mensagens já enviadas não mudam."
                      confirmLabel="Excluir resposta"
                      action={deleteQuickReplyAction}
                      fields={{ id: r.id }}
                    />
                  ) : null}
                </div>
                {manage ? (
                  <details>
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-info sm:min-h-0">Editar</summary>
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
      </Panel>
      {manage ? (
        <Panel title="Nova resposta">
          <QuickReplyForm />
        </Panel>
      ) : (
        <ManagersOnly />
      )}
    </div>
  );
}
