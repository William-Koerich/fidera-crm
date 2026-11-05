import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Notice, Skeleton } from "@/components/ui";
import { requireMembership } from "@/lib/auth";
import { decodeCursor } from "@/lib/inbox/cursor";
import { formatPhone, formatShortDate } from "@/lib/inbox/format";
import { listChannelAccounts, listConversations, type InboxFilter } from "@/lib/inbox/queries";
import { RealtimeRefresh } from "./realtime-refresh";
import { WindowBadge } from "./window-badge";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage({ searchParams }: PageProps<"/inbox">) {
  return (
    <main className="grid gap-3 p-4">
      <h1 className="text-xl font-semibold">Inbox</h1>
      <Suspense fallback={<ListSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filter: InboxFilter = params.filter === "awaiting" ? "awaiting" : "all";
  const cursorParam = typeof params.cursor === "string" ? params.cursor : null;
  const me = await requireMembership();

  const [{ items, nextCursor }, accounts] = await Promise.all([
    listConversations({ organizationId: me.organizationId, filter, cursor: decodeCursor(cursorParam) }),
    listChannelAccounts(me.organizationId),
  ]);
  const disconnected = accounts.filter((a) => a.status === "disconnected");

  return (
    <>
      <RealtimeRefresh table="conversations" filter={`organization_id=eq.${me.organizationId}`} />

      {disconnected.length > 0 ? (
        <Notice tone="warning">
          O WhatsApp foi desconectado ({disconnected[0]?.disconnected_reason ?? "sem motivo informado"}). Novas mensagens
          não chegam até você reconectar em <Link href="/settings" className="underline">Ajustes</Link>.
        </Notice>
      ) : null}

      {accounts.length === 0 ? (
        <Notice tone="info">
          Nenhum canal conectado. <Link href="/settings" className="font-medium underline">Conecte o WhatsApp</Link> para
          receber conversas.
        </Notice>
      ) : null}

      <nav className="flex gap-2 text-sm" aria-label="Filtro">
        <FilterTab href="/inbox" active={filter === "all"}>
          Todas
        </FilterTab>
        <FilterTab href="/inbox?filter=awaiting" active={filter === "awaiting"}>
          Sem resposta
        </FilterTab>
      </nav>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">
          {filter === "awaiting" ? "Ninguém esperando resposta." : "Nenhuma conversa ainda."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`/inbox/${c.id}`} className="flex gap-3 px-4 py-3 active:bg-background">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className={`truncate ${c.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>
                      {c.contactName || formatPhone(c.contactPhone) || "Contato"}
                    </p>
                    <span className="ml-auto shrink-0 text-xs text-text-muted">
                      {c.lastMessageAt ? formatShortDate(c.lastMessageAt) : ""}
                    </span>
                  </div>
                  <p className="truncate text-sm text-text-muted">{c.lastMessagePreview ?? ""}</p>
                  {c.awaitingReply ? (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs font-medium text-warning">Sem resposta</span>
                      <WindowBadge endsAt={c.replyWindowEndsAt} compact />
                    </div>
                  ) : null}
                </div>
                {c.unreadCount > 0 ? (
                  <span className="mt-1 grid h-5 min-w-5 place-items-center self-start rounded-full bg-brand px-1.5 text-xs font-semibold text-white">
                    {c.unreadCount}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <Link
          href={`/inbox?${new URLSearchParams({ ...(filter === "awaiting" ? { filter } : {}), cursor: nextCursor })}`}
          className="py-2 text-center text-sm text-info"
        >
          Carregar mais
        </Link>
      ) : null}
    </>
  );
}

function FilterTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 ${active ? "bg-info-soft font-medium text-info" : "text-text-muted"}`}
    >
      {children}
    </Link>
  );
}
