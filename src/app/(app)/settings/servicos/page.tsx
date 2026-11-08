import type { Metadata } from "next";
import { Panel } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { durationLabel } from "@/lib/agenda/form";
import { listServices } from "@/lib/agenda/queries";
import { canManage, requireMembership } from "@/lib/auth";
import { deleteServiceAction } from "../atendimento/actions";
import { ServiceForm } from "../atendimento/service-form";
import { ManagersOnly, SettingsPage } from "../settings-page";

export const metadata: Metadata = { title: "Serviços" };

export default function Page() {
  return (
    <SettingsPage
      title="Serviços"
      description="Ao agendar, escolher um serviço já preenche a duração. Com prazo de retorno, o cliente aparece em Chamar hoje quando passar do prazo. Excluir não muda os agendamentos já feitos."
    >
      <Content />
    </SettingsPage>
  );
}

async function Content() {
  const me = await requireMembership();
  const manage = canManage(me.role);
  const services = await listServices(me.organizationId);
  return (
    <Panel>
      <div className="grid gap-5">
        {services.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum serviço cadastrado ainda.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {services.map((service) => (
              <li key={service.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{service.name}</span>
                <span className="shrink-0 text-sm text-text-muted tabular">
                  {durationLabel(service.durationMinutes)}
                  {service.returnAfterDays ? ` · volta em ${service.returnAfterDays} dias` : ""}
                </span>
                {manage ? (
                  <ConfirmDialog
                    trigger="Excluir"
                    title={`Excluir "${service.name}"?`}
                    description="O serviço sai da lista. Os agendamentos já feitos continuam com o nome dele."
                    confirmLabel="Excluir"
                    action={deleteServiceAction}
                    fields={{ id: service.id }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {manage ? <ServiceForm /> : <ManagersOnly />}
      </div>
    </Panel>
  );
}
