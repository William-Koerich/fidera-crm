import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Fragment, Suspense } from "react";
import { Icon } from "@/components/icons";
import { Avatar, Skeleton } from "@/components/ui";
import { formatDay } from "@/lib/agenda/form";
import { listServices, listUpcomingForContact } from "@/lib/agenda/queries";
import { isAssistantEnabled } from "@/lib/ai/assistant";
import { canManage, requireMembership } from "@/lib/auth";
import { decodeCursor } from "@/lib/inbox/cursor";
import { channelLabel, dayKey, formatDayLabel, formatPhone } from "@/lib/inbox/format";
import {
  getConversation,
  listContactLabelIds,
  listInboxOptions,
  listMessages,
  listNotes,
  listTeamMembers,
} from "@/lib/inbox/queries";
import { isRatingEnabled, listQuickReplies } from "@/lib/replies/queries";
import { ConversationList, ListSkeleton, parseInboxParams } from "../conversation-list";
import { RealtimeRefresh } from "../realtime-refresh";
import { WindowBadge } from "../window-badge";
import { Composer } from "./composer";
import { ContactPanel } from "./contact-panel";
import { ConversationBar } from "./conversation-bar";
import { MarkRead } from "./mark-read";
import { DaySeparator, MessageBubble, NoteBubble } from "./message-parts";
import { ScheduleProvider } from "./schedule";
import { ScrollToBottom } from "./scroll-to-bottom";

export const metadata: Metadata = { title: "Conversa" };

type Params = Promise<{ conversationId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default function ConversationPage({ params, searchParams }: PageProps<"/inbox/[conversationId]">) {
  return (
    <div className="flex flex-1 lg:h-dvh lg:flex-none lg:overflow-hidden">
      <section
        aria-label="Conversas"
        className="hidden w-[380px] shrink-0 overflow-y-auto border-r border-border bg-background lg:block"
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
      <div className="flex h-16 items-center gap-3 border-b border-border bg-background px-4">
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
  // A message prepared elsewhere (Chamar hoje). It only fills the box: nothing is sent without a click.
  const draftText = typeof query.texto === "string" ? query.texto.slice(0, 1000) : "";
  const [{ items, olderCursor }, quickReplies, members, options, contactLabelIds, rating, upcoming, services] = await Promise.all([
    listMessages(conversation.id, before),
    listQuickReplies(me.organizationId),
    listTeamMembers(conversation.organizationId),
    listInboxOptions(conversation.organizationId),
    listContactLabelIds(conversation.contact.id),
    isRatingEnabled(conversation.organizationId),
    listUpcomingForContact(conversation.contact.id),
    listServices(conversation.organizationId),
  ]);
  const notes = await listNotes(
    conversation.id,
    olderCursor ? (items[0]?.occurred_at ?? null) : null,
    before ? (items.at(-1)?.occurred_at ?? null) : null,
  );
  const authorOf = (id: string | null) => members.find((m) => m.id === id)?.email ?? "Ex-integrante da equipe";
  const timeline = [
    ...items.map((message) => ({ at: message.occurred_at, message, note: null })),
    ...notes.map((note) => ({ at: note.createdAt, message: null, note })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const { contact } = conversation;
  const title = contact.name || formatPhone(contact.phone) || "Contato";
  const windowOpen =
    !conversation.hasReplyWindow ||
    (conversation.replyWindowEndsAt ? new Date(conversation.replyWindowEndsAt) > new Date() : false);
  const backHref =
    query.filter === "awaiting" || query.filter === "mine" || query.filter === "closed" ? `/inbox?filter=${query.filter}` : "/inbox";
  const connected = conversation.account.status === "active";

  return (
    <ScheduleProvider
      conversationId={conversation.id}
      clientName={contact.name ?? formatPhone(contact.phone)}
      hasContactName={!!contact.name}
      services={services}
      defaultStaffId={conversation.assignedTo}
      members={members}
    >
      <div className="fixed inset-0 z-30 flex flex-col bg-background lg:static lg:z-auto lg:min-w-0 lg:flex-1">
        <RealtimeRefresh table="messages" filter={`conversation_id=eq.${conversation.id}`} />
        <RealtimeRefresh table="conversation_notes" filter={`conversation_id=eq.${conversation.id}`} />
        <MarkRead conversationId={conversation.id} />

        <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-background px-2 pt-[env(safe-area-inset-top)] sm:px-4">
          <Link
            href={backHref}
            aria-label="Voltar para as conversas"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-background hover:text-text lg:hidden"
          >
            <Icon name="back" />
          </Link>
          <Avatar name={contact.name} phone={contact.phone} src={contact.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1 pl-1">
            <h1 className="truncate font-display text-base font-medium tracking-[-0.01em] sm:text-lg">{title}</h1>
            <p className="truncate text-xs text-text-muted">
              {contact.phone ? `${formatPhone(contact.phone)} · ` : ""}
              {channelLabel(conversation.channel)}
            </p>
          </div>
          <div className="shrink-0 sm:hidden">
            <WindowBadge endsAt={conversation.replyWindowEndsAt} compact />
          </div>
          <div className="hidden shrink-0 sm:block">
            <WindowBadge endsAt={conversation.replyWindowEndsAt} />
          </div>
        </header>

        <ConversationBar
          key={conversation.id}
          conversationId={conversation.id}
          status={conversation.status}
          assignedTo={conversation.assignedTo}
          departmentId={conversation.departmentId}
          contactOwnerId={contact.ownerId}
          canChangeOwner={canManage(me.role)}
          contactLabelIds={contactLabelIds}
          members={members}
          currentUserId={me.user.id}
          departments={options.departments}
          endings={options.endings}
          labels={options.labels}
          ratingEnabled={rating}
          aiEnabled={isAssistantEnabled()}
          upcoming={upcoming.map((a) => `${formatDay(a.date)} às ${a.time}${a.service ? ` · ${a.service}` : ""}`)}
        />

        <div data-thread-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-sunken">
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

            {timeline.length === 0 ? (
              <p className="py-10 text-center text-sm text-text-muted">Nenhuma mensagem nesta conversa ainda.</p>
            ) : null}

            {timeline.map((entry, i) => {
              const day = dayKey(new Date(entry.at));
              const prev = timeline[i - 1];
              const newDay = !prev || dayKey(new Date(prev.at)) !== day;
              return (
                <Fragment key={entry.message?.id ?? entry.note?.id}>
                  {newDay ? <DaySeparator label={formatDayLabel(entry.at)} /> : null}
                  {entry.message ? <MessageBubble message={entry.message} /> : null}
                  {entry.note ? <NoteBubble body={entry.note.body} at={entry.note.createdAt} author={authorOf(entry.note.authorId)} /> : null}
                </Fragment>
              );
            })}
            <ScrollToBottom key={`${conversation.id}-${before ?? ""}`} token={timeline.at(-1)?.message?.id ?? timeline.at(-1)?.note?.id} />
          </div>
        </div>

        <footer className="shrink-0 border-t border-border bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="mx-auto max-w-3xl">
            {windowOpen && connected ? (
              <Composer
                key={draftText}
                conversationId={conversation.id}
                quickReplies={quickReplies}
                canSendFiles={conversation.canSendFiles}
                initialText={draftText}
                aiEnabled={isAssistantEnabled()}
              />
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
    </ScheduleProvider>
  );
}
