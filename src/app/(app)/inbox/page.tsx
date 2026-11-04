import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { requireMembership } from "@/lib/auth";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <main className="grid gap-4 p-4">
      <h1 className="text-xl font-semibold">Inbox</h1>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireMembership();
  return <p className="text-sm text-text-muted">Nenhuma conversa ainda em {me.organizationName}.</p>;
}
