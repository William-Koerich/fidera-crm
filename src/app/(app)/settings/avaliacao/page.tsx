import type { Metadata } from "next";
import { Panel } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { getNpsSettings } from "@/lib/replies/queries";
import { NpsForm } from "../respostas/nps-form";
import { ManagersOnly, SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "Avaliação do atendimento" };

export default function Page() {
  return (
    <SettingsPage
      title="Avaliação do atendimento"
      description="Pede uma nota ao finalizar uma conversa. Cada cliente recebe no máximo uma a cada 30 dias, e dá para desmarcar ao finalizar. O resultado fica em Relatórios."
    >
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  if (!canManage(me.role)) return <ManagersOnly />;
  const nps = await getNpsSettings(me.organizationId);
  return (
    <Panel>
      <NpsForm enabled={nps.enabled} question={nps.question} thanks={nps.thanks} />
    </Panel>
  );
}
