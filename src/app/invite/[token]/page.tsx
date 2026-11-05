import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = { title: "Convite", robots: { index: false } };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <AuthShell
      title="Você foi convidado para uma equipe"
      description="Ao aceitar, você passa a ver e responder as conversas desse negócio no Fidera."
    >
      <Suspense fallback={<Skeleton className="h-28" />}>
        <Content params={params} />
      </Suspense>
    </AuthShell>
  );
}

async function Content({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser(`/invite/${token}`);
  return <AcceptInviteForm token={token} email={user.email} />;
}
