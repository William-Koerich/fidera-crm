import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Panel, Skeleton } from "@/components/ui";
import { requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { SimulatorForm } from "./simulator-form";

export const metadata: Metadata = { title: "Simulador" };

export default function SimulatorPage() {
  return (
    <main className="grid gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Simulador de WhatsApp</h1>
        <p className="text-sm text-text-muted">
          Gera webhooks no formato da Cloud API, assinados, e passa pelo mesmo caminho do webhook real.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  await requireMembership();
  if (getWhatsAppProviderName() !== "mock") notFound();
  return (
    <Panel>
      <SimulatorForm />
    </Panel>
  );
}
