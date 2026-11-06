import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Fragment, Suspense } from "react";
import { Icon } from "@/components/icons";
import { Avatar, Skeleton } from "@/components/ui";
import { requireMembership } from "@/lib/auth";
import { decodeCursor } from "@/lib/inbox/cursor";
import { dayKey, formatDayLabel, formatPhone } from "@/lib/inbox/format";
import { getConversation, listMessages, listTeamMembers } from "@/lib/inbox/queries";
import { listQuickReplies } from "@/lib/replies/queries";
import { ConversationList, ListSkeleton, parseInboxParams } from "../conversation-list";
import { RealtimeRefresh } from "../realtime-refresh";
import { WindowBadge } from "../window-badge";
import { AssigneeSelect } from "./assignee-select";
import { Composer } from "./composer";
import { ContactPanel } from "./contact-panel";
import { MarkRead } from "./mark-read";
import { DaySeparator, MessageBubble } from "./message-parts";
import { ScrollToBottom } from "./scroll-to-bottom";

export const metadata: Metadata = { title: "Conversa" };

type Params = Promise<{ conversationId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default function ConversationPage({ params, searchParams }: PageProps<"/inbox/[conversationId]">) {
  return (
    <div className="flex flex-1 lg:h-dvh lg:overflow-hidden">
      <section
        aria-label="Conversas"
        className="hidden w-[380px] shrink-0 overflow-y-auto border-r border-border bg-surface lg:block"
      >
        <Suspense fallback={<ListSkeleton />}>
          <SideList params={params} searchParams={searchParams} />
        </Suspense>
      </section>
      <Suspense fallback={<ConversationSkeleton />}>
        <Conversation params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SideList({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ conversationId }, query] = await Promise.all([params, searchParams]);
  await connection();
  const me = await requireMembership();
  const { filter } = parseInboxParams(query);
  return <ConversationList organizationId={me.organizationId} filter={filter} cursor={null} activeId={conversationId} />;
}

function ConversationSkeleton() {
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-background lg:static lg:z-auto lg:min-w-0 lg:flex-1">
      <div className="flex h-16 items-center gap-3 border-b border-border bg-surface px-4">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex-1 space-y-3 p-4">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="ml-auto h-12 w-1/2" />
        <Skeleton className="h-12 w-3/5" />
      </div>
    </div>
  );
}

async function Conversation({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ conversationId }, query] = await Promise.all([params, searchParams]);
  // The reply window and day labels are compared with "now": render at request time.
  await connection();
  const me = await requireMembership();
  const conversation = await getConversation(conversationId);
  if (!conversation) notFound();

  const before = typeof query.before === "string" ? decodeCursor(query.before) : null;
  const [{ items, olderCursor }, quickReplies, members] = await Promise.all([
    listMessages(conversation.id, before),
    listQuickReplies(me.organizationId),
    listTeamMembers(conversation.organizationId),
  ]);
  const { contact } = conversation;
  const title = contact.name || formatPhone(contact.phone) || "Contato";
  const windowOpen =
    !conversation.hasReplyWindow ||
    (conversation.replyWindowEndsAt ? new Date(conversation.replyWindowEndsAt) > new Date() : false);
  const backHref = query.filter === "awaiting" || query.filter === "mine" ? `/inbox?filter=${query.filter}` : "/inbox";
  const connected = conversation.account.status === "active";

  return (
    <>
      <div className="fixed inset-0 z-30 flex flex-col bg-background lg:static lg:z-auto lg:min-w-0 lg:flex-1">
        <RealtimeRefresh table="messages" filter={`conversation_id=eq.${conversation.id}`} />
        <MarkRead conversationId={conversation.id} />

        <header className="flex min-h-16 items-center gap-2 border-b border-border bg-surface px-2 pt-[env(safe-area-inset-top)] sm:px-4">
          <Link
            href={backHref}
            aria-label="Voltar para a inbox"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-background hover:text-text lg:hidden"
          >
            <Icon name="back" />
          </Link>
          <Avatar name={contact.name} phone={contact.phone} src={contact.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1 pl-1">
            <h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>
            <p className="truncate text-xs text-text-muted">
              {contact.phone ? `${formatPhone(contact.phone)} · ` : ""}
              {conversation.channel === "whatsapp" ? "WhatsApp" : "Instagram"}
            </p>
          </div>
          <div className="shrink-0 sm:hidden">
            <WindowBadge endsAt={conversation.replyWindowEndsAt} compact />
          </div>
          <div className="hidden shrink-0 sm:block">
            <WindowBadge endsAt={conversation.replyWindowEndsAt} />
          </div>
        </header>

        <AssigneeSelect
          key={conversation.id}
          conversationId={conversation.id}
          assignedTo={conversation.assignedTo}
          members={members}
          currentUserId={me.user.id}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-1.5 px-3 py-4 sm:px-6">
            {olderCursor ? (
              <Link
                href={`/inbox/${conversation.id}?before=${olderCursor}`}
                className="inline-flex min-h-11 items-center self-center px-3 text-sm font-medium text-info hover:underline"
              >
                Ver mensagens anteriores
              </Link>
            ) : null}
            {before ? (
              <Link
                href={`/inbox/${conversation.id}`}
                className="inline-flex min-h-11 items-center self-center px-3 text-sm font-medium text-info hover:underline"
              >
                Voltar para as mais recentes
              </Link>
            ) : null}

            {items.length === 0 ? (
              <p className="py-10 text-center text-sm text-text-muted">Nenhuma mensagem nesta conversa ainda.</p>
            ) : null}

            {items.map((m, i) => {
              const day = dayKey(new Date(m.occurred_at));
              const prev = items[i - 1];
              const newDay = !prev || dayKey(new Date(prev.occurred_at)) !== day;
              return (
                <Fragment key={m.id}>
                  {newDay ? <DaySeparator label={formatDayLabel(m.occurred_at)} /> : null}
                  <MessageBubble message={m} />
                </Fragment>
              );
            })}
            <ScrollToBottom token={items.at(-1)?.id} />
          </div>
        </div>

        <footer className="border-t border-border bg-surface px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="mx-auto max-w-3xl">
            {windowOpen && connected ? (
              <Composer conversationId={conversation.id} quickReplies={quickReplies} canSendFiles={conversation.canSendFiles} />
            ) : (
              <p className="text-sm text-text-muted">
                {!connected
                  ? "O WhatsApp está desconectado. Reconecte em Ajustes para responder por aqui."
                  : "A janela de 24h fechou. Você poderá responder quando o cliente mandar uma nova mensagem."}
              </p>
            )}
          </div>
        </footer>
      </div>

      <aside
        aria-label="Detalhes do cliente"
        className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-border bg-surface xl:block"
      >
        <ContactPanel conversation={conversation} />
      </aside>
    </>
  );
}
