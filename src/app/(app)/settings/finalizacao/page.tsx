import type { Metadata } from "next";
import { Panel } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { listInboxOptions } from "@/lib/inbox/queries";
import { ImportFromChannel, TeamItemForm } from "../atendimento/forms";
import { ItemList } from "../atendimento/item-list";
import { ManagersOnly, SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "Motivos de finalização" };

export default function Page() {
  return (
    <SettingsPage title="Motivos de finalização" description="O que a equipe escolhe ao finalizar uma conversa. No ChatPro, o motivo é obrigatório para encerrar o atendimento.">
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  const manage = canManage(me.role);
  const { endings: items } = await listInboxOptions(me.organizationId);
  return (
    <Panel>
      <div className="grid gap-5">
        <ItemList kind="endings" items={items} manage={manage} empty="Nenhum motivo cadastrado ainda." warning="As conversas já finalizadas ficam sem motivo." />
        {manage ? <TeamItemForm kind="endings" label="Novo motivo" /> : <ManagersOnly />}
          {manage ? <ImportFromChannel kind="endings" /> : null}
      </div>
    </Panel>
  );
}
