import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Seu negócio" };

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div className="grid gap-1">
        <p className="text-sm font-medium text-info">Passo 1 de 2</p>
        <h1 className="text-2xl font-semibold tracking-tight">Como se chama o seu negócio?</h1>
        <p className="text-sm text-text-muted">
          Depois você conecta o WhatsApp e convida a equipe.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-32" />}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  await requireUser("/onboarding");
  return <OnboardingForm />;
}
