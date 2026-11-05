import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, PageHeader, Panel, Skeleton } from "@/components/ui";
import { requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { SimulatorForm } from "./simulator-form";

export const metadata: Metadata = { title: "Simulador" };

export default function SimulatorPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <PageHeader
        title="Simulador de WhatsApp"
        description="Gera mensagens falsas, assinadas no formato da API oficial, e passa pelo mesmo caminho do webhook real."
        actions={<Badge tone="warning">Ambiente de desenvolvimento</Badge>}
      />
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Gate />
        </Suspense>
      </div>
    </div>
  );
}

async function Gate() {
  await requireMembership();
  if (getWhatsAppProviderName() !== "mock") notFound();
  return (
    <Panel title="Dados da simulação" description="Use nomes que deixem claro que é um teste.">
      <SimulatorForm />
    </Panel>
  );
}
