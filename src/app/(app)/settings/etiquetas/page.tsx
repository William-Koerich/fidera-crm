import type { Metadata } from "next";
import { Panel } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { listInboxOptions } from "@/lib/inbox/queries";
import { TeamItemForm } from "../atendimento/forms";
import { ItemList } from "../atendimento/item-list";
import { ManagersOnly, SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "Etiquetas" };

export default function Page() {
  return (
    <SettingsPage title="Etiquetas" description="Marque clientes para encontrá-los depois, como VIP ou primeira visita.">
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  const manage = canManage(me.role);
  const { labels: items } = await listInboxOptions(me.organizationId);
  return (
    <Panel>
      <div className="grid gap-5">
        <ItemList kind="labels" items={items} manage={manage} empty="Nenhuma etiqueta cadastrada ainda." warning="Os contatos perdem esta etiqueta." />
        {manage ? <TeamItemForm kind="labels" label="Nova etiqueta" withColor /> : <ManagersOnly />}
      </div>
    </Panel>
  );
}
