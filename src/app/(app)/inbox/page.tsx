import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui";
import { requireMembership } from "@/lib/auth";
import { ConversationList, ListSkeleton, parseInboxParams } from "./conversation-list";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage({ searchParams }: PageProps<"/inbox">) {
  return (
    <div className="flex flex-1 lg:h-dvh lg:overflow-hidden">
      <section
        aria-label="Conversas"
        className="w-full bg-surface lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-border"
      >
        <Suspense fallback={<ListSkeleton />}>
          <List searchParams={searchParams} />
        </Suspense>
      </section>
      <div className="hidden flex-1 items-center justify-center lg:flex">
        <EmptyState
          icon="message"
          title="Selecione uma conversa"
          description="Escolha um cliente na lista para ler as mensagens e responder."
        />
      </div>
    </div>
  );
}

async function List({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { filter, cursor } = parseInboxParams(await searchParams);
  // Dates in the list are relative to "now": render at request time.
  await connection();
  const me = await requireMembership();
  return <ConversationList organizationId={me.organizationId} filter={filter} cursor={cursor} />;
}
