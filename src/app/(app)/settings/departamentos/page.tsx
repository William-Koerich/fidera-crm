import type { Metadata } from "next";
import { Panel } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { listInboxOptions } from "@/lib/inbox/queries";
import { ImportFromChannel, TeamItemForm } from "../atendimento/forms";
import { ItemList } from "../atendimento/item-list";
import { ManagersOnly, SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "Departamentos" };

export default function Page() {
  return (
    <SettingsPage title="Departamentos" description="Separe as conversas por área, como recepção ou barbearia.">
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  const manage = canManage(me.role);
  const { departments: items } = await listInboxOptions(me.organizationId);
  return (
    <Panel>
      <div className="grid gap-5">
        <ItemList kind="departments" items={items} manage={manage} empty="Nenhum departamento cadastrado ainda." warning="As conversas deste departamento ficam sem departamento." />
        {manage ? <TeamItemForm kind="departments" label="Novo departamento" /> : <ManagersOnly />}
          {manage ? <ImportFromChannel kind="departments" /> : null}
      </div>
    </Panel>
  );
}
