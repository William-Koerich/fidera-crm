import type { Metadata } from "next";
import { Panel } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { getAccessSettings, listInboxOptions } from "@/lib/inbox/queries";
import { AccessForm } from "../atendimento/access-form";
import { ManagersOnly, SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "Permissões" };

export default function Page() {
  return (
    <SettingsPage
      title="Permissões da equipe"
      description="Donos e administradores sempre veem tudo. Só eles exportam dados, veem relatórios e apagam contatos. Vale só no Fidera: o acesso de cada pessoa ao ChatPro não muda."
    >
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  if (!canManage(me.role)) return <ManagersOnly />;
  const [access, { departments }] = await Promise.all([getAccessSettings(me.organizationId), listInboxOptions(me.organizationId)]);
  return (
    <Panel>
      <AccessForm visibility={access.visibility} members={access.members} departments={departments} />
    </Panel>
  );
}
