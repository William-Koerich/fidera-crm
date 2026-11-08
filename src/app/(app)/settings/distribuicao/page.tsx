import type { Metadata } from "next";
import { Panel } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { getDistribution } from "@/lib/inbox/queries";
import { DistributionForm } from "../atendimento/distribution-form";
import { ManagersOnly, SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "Distribuição" };

export default function Page() {
  return (
    <SettingsPage title="Distribuição automática" description="Divide as novas conversas entre a equipe, sem ninguém precisar escolher. Vem desligada.">
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  if (!canManage(me.role)) return <ManagersOnly />;
  const distribution = await getDistribution(me.organizationId);
  return (
    <Panel>
      <DistributionForm enabled={distribution.enabled} members={distribution.members} />
    </Panel>
  );
}
