import type { Metadata } from "next";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { Button, ButtonLink, DescriptionList, Panel, Skeleton } from "@/components/ui";
import { getMemberships, requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { signOutAction } from "../../../login/actions";
import { OrgSwitcher } from "../../shell/org-switcher";

export const metadata: Metadata = { title: "Minha conta" };

const ROLE_LABEL = { owner: "Dono", admin: "Administrador", member: "Membro" } as const;

export default function AccountPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const me = await requireMembership();
  const memberships = await getMemberships();
  const devTools = getWhatsAppProviderName() === "mock";

  return (
    <>
      <Panel title="Seus dados">
        <DescriptionList
          items={[
            { term: "E-mail", detail: me.user.email ?? "Não informado" },
            { term: "Papel neste negócio", detail: ROLE_LABEL[me.role] },
          ]}
        />
      </Panel>

      <Panel
        title="Negócio"
        description={
          memberships.length > 1
            ? "Você tem acesso a mais de um negócio. Escolha qual quer ver agora."
            : "O negócio que você está usando."
        }
      >
        {memberships.length > 1 ? (
          <div className="max-w-sm">
            <OrgSwitcher
              activeId={me.organizationId}
              organizations={memberships.map((m) => ({ id: m.organizationId, name: m.organizationName }))}
            />
          </div>
        ) : (
          <p className="text-sm font-medium">{me.organizationName}</p>
        )}
      </Panel>

      {devTools ? (
        <Panel title="Ferramentas de desenvolvimento" description="Visíveis só enquanto o WhatsApp está em modo de teste.">
          <ButtonLink href="/dev/simulator" variant="secondary">
            <Icon name="wrench" className="size-4" />
            Abrir o simulador
          </ButtonLink>
        </Panel>
      ) : null}

      <Panel title="Sessão" description="Sair encerra o acesso neste aparelho. As conversas continuam salvas.">
        <form action={signOutAction}>
          <Button type="submit" variant="secondary">
            <Icon name="logout" className="size-4" />
            Sair da conta
          </Button>
        </form>
      </Panel>
    </>
  );
}
