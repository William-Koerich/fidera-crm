import type { Metadata } from "next";
import { Suspense } from "react";
import { Panel, Skeleton } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { canManage, requireMembership } from "@/lib/auth";
import { getDistribution, listInboxOptions } from "@/lib/inbox/queries";
import type { TeamItemKind } from "@/lib/replies/team-items";
import { deleteTeamItemAction } from "./actions";
import { DistributionForm } from "./distribution-form";
import { ImportFromChannel, TeamItemForm } from "./forms";

export const metadata: Metadata = { title: "Atendimento" };

export default function ServicePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Service />
    </Suspense>
  );
}

function ItemList({
  kind,
  items,
  manage,
  empty,
  warning,
}: {
  kind: TeamItemKind;
  items: { id: string; name: string; color?: string }[];
  manage: boolean;
  empty: string;
  warning: string;
}) {
  if (items.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 px-4 py-2">
          {item.color ? <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /> : null}
          <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
          {manage ? (
            <ConfirmDialog
              trigger="Excluir"
              title={`Excluir "${item.name}"?`}
              description={`${warning} Isso vale só para o Fidera: no ChatPro, o item continua.`}
              confirmLabel="Excluir"
              action={deleteTeamItemAction}
              fields={{ kind, id: item.id }}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

async function Service() {
  const me = await requireMembership();
  const manage = canManage(me.role);
  const [{ endings, departments, labels }, distribution] = await Promise.all([
    listInboxOptions(me.organizationId),
    manage ? getDistribution(me.organizationId) : null,
  ]);

  return (
    <>
      {distribution ? (
        <Panel title="Distribuição automática" description="Divide as novas conversas entre a equipe, sem ninguém precisar escolher. Vem desligada.">
          <DistributionForm enabled={distribution.enabled} members={distribution.members} />
        </Panel>
      ) : null}
      <Panel title="Motivos de finalização" description="O que a equipe escolhe ao finalizar uma conversa. No ChatPro, o motivo é obrigatório para encerrar o atendimento.">
        <div className="grid gap-4">
          <ItemList kind="endings" items={endings} manage={manage} empty="Nenhum motivo cadastrado ainda." warning="As conversas já finalizadas ficam sem motivo." />
          {manage ? <TeamItemForm kind="endings" label="Novo motivo" /> : null}
          {manage ? <ImportFromChannel kind="endings" /> : null}
        </div>
      </Panel>
      <Panel title="Departamentos" description="Separe as conversas por área, como recepção ou barbearia.">
        <div className="grid gap-4">
          <ItemList kind="departments" items={departments} manage={manage} empty="Nenhum departamento cadastrado ainda." warning="As conversas deste departamento ficam sem departamento." />
          {manage ? <TeamItemForm kind="departments" label="Novo departamento" /> : null}
          {manage ? <ImportFromChannel kind="departments" /> : null}
        </div>
      </Panel>
      <Panel title="Etiquetas" description="Marque contatos para encontrá-los depois, como VIP ou primeira visita.">
        <div className="grid gap-4">
          <ItemList kind="labels" items={labels} manage={manage} empty="Nenhuma etiqueta cadastrada ainda." warning="Os contatos perdem esta etiqueta." />
          {manage ? <TeamItemForm kind="labels" label="Nova etiqueta" withColor /> : null}
        </div>
      </Panel>
      {!manage ? <p className="text-sm text-text-muted">Apenas donos e administradores podem alterar estas listas.</p> : null}
    </>
  );
}
