import Link from "next/link";
import { Icon } from "@/components/icons";
import { Alert, Avatar, ButtonLink, EmptyState, Input, Skeleton, TabLinks, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { decodeCursor } from "@/lib/inbox/cursor";
import { formatPhone, formatShortDate } from "@/lib/inbox/format";
import { listChannelAccounts, listConversations, type InboxFilter } from "@/lib/inbox/queries";
import { listLabels } from "@/lib/labels/server";
import { isStage } from "@/lib/labels/stages";
import { LabelChip } from "@/components/label-chip";
import { RealtimeRefresh } from "./realtime-refresh";
import { WindowBadge } from "./window-badge";

export function parseInboxParams(params: Record<string, string | string[] | undefined>) {
  return {
    filter: (params.filter === "awaiting" || params.filter === "mine" || params.filter === "closed" ? params.filter : "all") as InboxFilter,
    search: typeof params.q === "string" && params.q.trim().length >= 2 ? params.q.trim().slice(0, 100) : null,
    cursor: typeof params.cursor === "string" ? params.cursor : null,
    labelId: typeof params.etiqueta === "string" && UUID.test(params.etiqueta) ? params.etiqueta : null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Query string that keeps the list's filter and label when opening or leaving a conversation. */
export function listQuery(filter: InboxFilter, labelId: string | null, extra: Record<string, string> = {}): string {
  return new URLSearchParams({ ...(filter !== "all" ? { filter } : {}), ...(labelId ? { etiqueta: labelId } : {}), ...extra }).toString();
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

function hrefFor(filter: InboxFilter, labelId: string | null, extra: Record<string, string> = {}) {
  const q = listQuery(filter, labelId, extra);
  return q ? `/inbox?${q}` : "/inbox";
}

const MAX_ROW_LABELS = 3;

/** Conversation list with filters, alerts and empty states. Shared by /inbox and the desktop pane of a conversation. */
export async function ConversationList({
  organizationId,
  filter,
  cursor,
  activeId,
  search,
  labelId = null,
}: {
  organizationId: string;
  filter: InboxFilter;
  cursor: string | null;
  activeId?: string;
  search?: string | null;
  labelId?: string | null;
}) {
  const user = await requireUser();
  const [{ items, nextCursor }, accounts, labels] = await Promise.all([
    listConversations({ organizationId, filter, cursor: decodeCursor(cursor), userId: user.id, search, labelId }),
    listChannelAccounts(organizationId),
    listLabels(organizationId),
  ]);
  const labelById = new Map(labels.map((l) => [l.id, l]));
  const activeLabel = labelId ? labelById.get(labelId) : undefined;
  const disconnected = accounts.find((a) => a.status === "disconnected");
  const hasActiveChannel = accounts.some((a) => a.status === "active");
  const isMock = getWhatsAppProviderName() === "mock";

  return (
    <div className="flex min-h-full flex-col">
      <RealtimeRefresh table="conversations" filter={`organization_id=eq.${organizationId}`} />

      <div className="sticky top-14 z-10 border-b border-border bg-background/95 px-4 pt-5 pb-3 backdrop-blur lg:top-0">
        <h1 className="font-display text-[1.75rem] leading-tight font-medium tracking-[-0.02em]">Conversas</h1>
        <form action="/inbox" role="search" className="mt-3">
          <label htmlFor="inbox-search" className="sr-only">
            Buscar por nome, número ou mensagem
          </label>
          <Input
            id="inbox-search"
            type="search"
            name="q"
            defaultValue={search ?? ""}
            minLength={2}
            maxLength={100}
            placeholder="Buscar nome, número ou mensagem"
          />
        </form>
        <TabLinks
          className="mt-3"
          label="Filtrar conversas"
          active={search ? "" : filter}
          items={[
            { key: "all", label: "Todas", href: hrefFor("all", labelId) },
            { key: "awaiting", label: "Sem resposta", href: hrefFor("awaiting", labelId) },
            { key: "mine", label: "Minhas", href: hrefFor("mine", labelId) },
            { key: "closed", label: "Finalizadas", href: hrefFor("closed", labelId) },
          ]}
        />
        {labels.length > 0 && !search ? (
          <nav aria-label="Filtrar por etiqueta" className="-mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
            {labels.map((label) => {
              const active = label.id === labelId;
              return (
                <Link
                  key={label.id}
                  href={hrefFor(filter, active ? null : label.id)}
                  aria-current={active ? "page" : undefined}
                  title={isStage(label) ? `Etapa do funil: ${label.name}` : label.name}
                  className={cx(
                    "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors sm:min-h-8",
                    active ? "border-transparent text-text" : "border-border bg-surface text-text-muted hover:text-text",
                  )}
                  style={active ? { backgroundColor: `color-mix(in oklab, ${label.color} 22%, transparent)`, borderColor: label.color } : undefined}
                >
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
                  {label.name}
                  {active ? <Icon name="x" className="size-3.5" /> : null}
                </Link>
              );
            })}
          </nav>
        ) : null}
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
        activeLabel ? (
          <EmptyState
            icon="message"
            title={`Ninguém com "${activeLabel.name}" aqui`}
            description="Troque a aba acima ou tire o filtro de etiqueta para ver todas as conversas."
            action={
              <ButtonLink href={hrefFor(filter, null)} variant="secondary">
                Tirar o filtro
              </ButtonLink>
            }
          />
        ) : search ? (
          <EmptyState icon="message" title="Nada encontrado" description="Tente outro nome, número ou trecho da mensagem." />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon="plug"
            title="Conecte o WhatsApp para começar"
            description="As conversas dos seus clientes aparecem aqui assim que o número estiver conectado."
            action={<ButtonLink href="/settings/canais">Conectar WhatsApp</ButtonLink>}
          />
        ) : filter === "awaiting" ? (
          <EmptyState icon="check" title="Tudo respondido" description="Ninguém está esperando resposta agora." />
        ) : filter === "closed" ? (
          <EmptyState icon="check" title="Nenhuma conversa finalizada" description="As conversas que a equipe finalizar aparecem aqui." />
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
        <ul className="flex flex-col gap-1 p-2">
          {items.map((c) => {
            const name = c.contactName || formatPhone(c.contactPhone) || "Contato";
            const active = c.id === activeId;
            const unread = c.unreadCount > 0;
            // Stage first: it is what the team looks for when scanning the list.
            const rowLabels = labels.filter((l) => c.labelIds.includes(l.id));
            return (
              <li key={c.id}>
                <Link
                  href={`/inbox/${c.id}${listQuery(filter, labelId) ? `?${listQuery(filter, labelId)}` : ""}`}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex gap-3 rounded-2xl px-3 py-3 transition-colors",
                    active ? "bg-surface shadow-sm ring-1 ring-brand/25" : "hover:bg-surface/70 active:bg-surface/70",
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
                    {c.awaitingReply || rowLabels.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {c.awaitingReply ? (
                          <>
                            <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-warning">
                              <Icon name="alert" className="size-3" />
                              Sem resposta
                            </span>
                            <WindowBadge endsAt={c.replyWindowEndsAt} compact />
                          </>
                        ) : null}
                        {rowLabels.slice(0, MAX_ROW_LABELS).map((label) => (
                          <LabelChip key={label.id} name={label.name} color={label.color} stage={isStage(label)} size="xs" className="max-w-[9rem]" />
                        ))}
                        {rowLabels.length > MAX_ROW_LABELS ? (
                          <span className="text-[11px] font-medium text-text-muted">+{rowLabels.length - MAX_ROW_LABELS}</span>
                        ) : null}
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
            href={hrefFor(filter, labelId, { cursor: nextCursor })}
            className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-info hover:underline"
          >
            Carregar conversas mais antigas
          </Link>
        </div>
      ) : null}
    </div>
  );
}
