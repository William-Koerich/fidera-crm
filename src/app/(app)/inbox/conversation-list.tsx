import Link from "next/link";
import { Icon } from "@/components/icons";
import { Alert, Avatar, ButtonLink, EmptyState, Skeleton, TabLinks, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { decodeCursor } from "@/lib/inbox/cursor";
import { formatPhone, formatShortDate } from "@/lib/inbox/format";
import { listChannelAccounts, listConversations, type InboxFilter } from "@/lib/inbox/queries";
import { RealtimeRefresh } from "./realtime-refresh";
import { WindowBadge } from "./window-badge";

export function parseInboxParams(params: Record<string, string | string[] | undefined>) {
  return {
    filter: (params.filter === "awaiting" || params.filter === "mine" ? params.filter : "all") as InboxFilter,
    cursor: typeof params.cursor === "string" ? params.cursor : null,
  };
}

export function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando conversas">
      <div className="space-y-3 border-b border-border p-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-56" />
      </div>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex gap-3 px-4 py-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2 py-1">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function hrefFor(filter: InboxFilter, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ ...(filter !== "all" ? { filter } : {}), ...extra }).toString();
  return q ? `/inbox?${q}` : "/inbox";
}

/** Conversation list with filters, alerts and empty states. Shared by /inbox and the desktop pane of a conversation. */
export async function ConversationList({
  organizationId,
  filter,
  cursor,
  activeId,
}: {
  organizationId: string;
  filter: InboxFilter;
  cursor: string | null;
  activeId?: string;
}) {
  const user = await requireUser();
  const [{ items, nextCursor }, accounts] = await Promise.all([
    listConversations({ organizationId, filter, cursor: decodeCursor(cursor), userId: user.id }),
    listChannelAccounts(organizationId),
  ]);
  const disconnected = accounts.find((a) => a.status === "disconnected");
  const hasActiveChannel = accounts.some((a) => a.status === "active");
  const isMock = getWhatsAppProviderName() === "mock";

  return (
    <div className="flex min-h-full flex-col">
      <RealtimeRefresh table="conversations" filter={`organization_id=eq.${organizationId}`} />

      <div className="sticky top-14 z-10 border-b border-border bg-surface/95 px-4 pt-4 pb-3 backdrop-blur lg:top-0">
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        <TabLinks
          className="mt-3"
          label="Filtrar conversas"
          active={filter}
          items={[
            { key: "all", label: "Todas", href: hrefFor("all") },
            { key: "awaiting", label: "Sem resposta", href: hrefFor("awaiting") },
            { key: "mine", label: "Minhas", href: hrefFor("mine") },
          ]}
        />
      </div>

      {disconnected ? (
        <div className="px-4 pt-3">
          <Alert
            tone="warning"
            title="WhatsApp desconectado"
            action={
              <ButtonLink href="/settings/canais" variant="secondary" size="sm">
                Reconectar
              </ButtonLink>
            }
          >
            Mensagens novas não chegam até você reconectar o número.
          </Alert>
        </div>
      ) : null}

      {items.length === 0 ? (
        accounts.length === 0 ? (
          <EmptyState
            icon="plug"
            title="Conecte o WhatsApp para começar"
            description="As conversas dos seus clientes aparecem aqui assim que o número estiver conectado."
            action={<ButtonLink href="/settings/canais">Conectar WhatsApp</ButtonLink>}
          />
        ) : filter === "awaiting" ? (
          <EmptyState icon="check" title="Tudo respondido" description="Ninguém está esperando resposta agora." />
        ) : filter === "mine" ? (
          <EmptyState
            icon="user"
            title="Nenhuma conversa com você"
            description="Abra uma conversa e escolha você como responsável para ela aparecer aqui."
          />
        ) : (
          <EmptyState
            icon="message"
            title="Nenhuma conversa ainda"
            description={
              hasActiveChannel
                ? "Quando um cliente mandar mensagem para o seu WhatsApp, ela aparece aqui na hora."
                : "Termine a conexão do WhatsApp em Ajustes para começar a receber conversas."
            }
            action={
              isMock ? (
                <ButtonLink href="/dev/simulator" variant="secondary">
                  Simular uma mensagem
                </ButtonLink>
              ) : !hasActiveChannel ? (
                <ButtonLink href="/settings/canais" variant="secondary">
                  Ir para Ajustes
                </ButtonLink>
              ) : undefined
            }
          />
        )
      ) : (
        <ul className="divide-y divide-border">
          {items.map((c) => {
            const name = c.contactName || formatPhone(c.contactPhone) || "Contato";
            const active = c.id === activeId;
            const unread = c.unreadCount > 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/inbox/${c.id}${filter !== "all" ? `?filter=${filter}` : ""}`}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex gap-3 px-4 py-3 transition-colors",
                    active ? "bg-info-soft" : "hover:bg-background active:bg-background",
                  )}
                >
                  <Avatar name={c.contactName} phone={c.contactPhone} src={c.contactAvatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className={cx("truncate text-sm", unread ? "font-semibold text-text" : "font-medium text-text")}>
                        {name}
                      </p>
                      <span className={cx("ml-auto shrink-0 text-xs tabular", unread ? "font-medium text-brand" : "text-text-muted")}>
                        {c.lastMessageAt ? formatShortDate(c.lastMessageAt) : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className={cx("min-w-0 flex-1 truncate text-sm", unread ? "text-text" : "text-text-muted")}>
                        {c.lastFromUs ? <span className="text-text-muted">Você: </span> : null}
                        {c.lastMessagePreview ?? ""}
                      </p>
                      {unread ? (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-xs font-semibold text-white">
                          <span className="sr-only">Não lidas: </span>
                          {c.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    {c.awaitingReply ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                          <Icon name="alert" className="size-3" />
                          Sem resposta
                        </span>
                        <WindowBadge endsAt={c.replyWindowEndsAt} compact />
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor ? (
        <div className="border-t border-border p-3 text-center">
          <Link
            href={hrefFor(filter, { cursor: nextCursor })}
            className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-info hover:underline"
          >
            Carregar conversas mais antigas
          </Link>
        </div>
      ) : null}
    </div>
  );
}
