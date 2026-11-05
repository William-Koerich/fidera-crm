import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { signOutAction } from "../login/actions";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Seu negócio" };

export default function OnboardingPage() {
  return (
    <AuthShell
      eyebrow={
        <ol className="flex flex-wrap items-center gap-2" aria-label="Etapas">
          <li aria-current="step">1. Seu negócio</li>
          <li aria-hidden className="text-text-muted">
            →
          </li>
          <li className="text-text-muted">2. Conectar o WhatsApp</li>
        </ol>
      }
      title="Como se chama o seu negócio?"
      description="É o nome que a sua equipe vai ver. Você pode ter mais de um negócio na mesma conta."
      footer={
        <form action={signOutAction}>
          Entrou com a conta errada?{" "}
          <button type="submit" className="inline-flex min-h-11 items-center font-medium text-info hover:underline">
            Sair
          </button>
        </form>
      }
    >
      <Suspense fallback={<Skeleton className="h-28" />}>
        <Gate />
      </Suspense>
    </AuthShell>
  );
}

async function Gate() {
  await requireUser("/onboarding");
  return <OnboardingForm />;
}
