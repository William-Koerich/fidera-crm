import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { requireMembership } from "@/lib/auth";
import { decodeCursor } from "@/lib/inbox/cursor";
import { formatPhone, formatTime, whatsAppLink } from "@/lib/inbox/format";
import { getConversation, listMessages, type MessageItem } from "@/lib/inbox/queries";
import { RealtimeRefresh } from "../realtime-refresh";
import { WindowBadge } from "../window-badge";
import { Composer } from "./composer";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = { title: "Conversa" };

export default function ConversationPage({ params, searchParams }: PageProps<"/inbox/[conversationId]">) {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-96" />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const ORIGIN_LABEL: Partial<Record<MessageItem["origin"], string>> = {
  business_app_echo: "pelo celular",
  history: "histórico",
};

const STATUS_LABEL: Partial<Record<MessageItem["status"], string>> = {
  pending: "enviando",
  sent: "enviada",
  delivered: "entregue",
  read: "lida",
  failed: "falhou",
};

async function Content({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ conversationId }, query] = await Promise.all([params, searchParams]);
  // The reply window is compared with "now": render at request time.
  await connection();
  await requireMembership();
  const conversation = await getConversation(conversationId);
  if (!conversation) notFound();

  const before = typeof query.before === "string" ? decodeCursor(query.before) : null;
  const { items, olderCursor } = await listMessages(conversation.id, before);
  const title = conversation.contact.name || formatPhone(conversation.contact.phone) || "Contato";
  const windowOpen = conversation.replyWindowEndsAt ? new Date(conversation.replyWindowEndsAt) > new Date() : false;

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col">
      <RealtimeRefresh table="messages" filter={`conversation_id=eq.${conversation.id}`} />
      <MarkRead conversationId={conversation.id} />

      <header className="sticky top-14 z-[5] flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Link href="/inbox" className="text-sm text-info" aria-label="Voltar para a inbox">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{title}</h1>
          <p className="truncate text-xs text-text-muted">
            {formatPhone(conversation.contact.phone)} · {conversation.channel === "whatsapp" ? "WhatsApp" : "Instagram"}
          </p>
        </div>
        <WindowBadge endsAt={conversation.replyWindowEndsAt} />
      </header>

      <div className="flex flex-1 flex-col gap-2 px-4 py-4">
        {olderCursor ? (
          <Link
            href={`/inbox/${conversation.id}?before=${olderCursor}`}
            className="self-center py-1 text-sm text-info"
          >
            Ver mensagens anteriores
          </Link>
        ) : null}
        {before ? (
          <Link href={`/inbox/${conversation.id}`} className="self-center py-1 text-sm text-info">
            Voltar para as mais recentes
          </Link>
        ) : null}

        {items.map((m) => {
          const outbound = m.direction === "outbound";
          return (
            <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  outbound ? "rounded-br-sm bg-brand-soft text-text" : "rounded-bl-sm border border-border bg-surface"
                }`}
              >
                {m.mediaUrl && m.media_mime_type?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={m.mediaUrl} alt="Imagem recebida" className="mb-1 max-h-72 rounded-xl object-contain" />
                ) : m.mediaUrl && m.media_mime_type?.startsWith("audio/") ? (
                  <audio controls src={m.mediaUrl} className="mb-1 max-w-full" />
                ) : m.mediaUrl ? (
                  <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-info underline">
                    Abrir {m.type}
                  </a>
                ) : m.type !== "text" ? (
                  <p className="text-xs font-medium text-text-muted">[{m.type}]</p>
                ) : null}
                {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
                <p className="mt-1 text-right text-[11px] text-text-muted">
                  {formatTime(m.occurred_at)}
                  {ORIGIN_LABEL[m.origin] ? ` · ${ORIGIN_LABEL[m.origin]}` : ""}
                  {outbound && STATUS_LABEL[m.status] ? ` · ${STATUS_LABEL[m.status]}` : ""}
                </p>
                {m.status === "failed" ? <p className="text-xs text-danger">Não enviada</p> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-14 border-t border-border bg-surface px-4 py-3">
        {windowOpen && conversation.account.status === "active" ? (
          <Composer conversationId={conversation.id} />
        ) : (
          <div className="grid gap-2">
            <p className="text-sm text-text-muted">
              {conversation.account.status !== "active"
                ? "Canal desconectado. Reconecte em Ajustes."
                : "A janela de 24h está fechada. Responda pelo WhatsApp do celular, sem custo de API."}
            </p>
            {conversation.contact.phone && conversation.channel === "whatsapp" ? (
              <a
                href={whatsAppLink(conversation.contact.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-medium text-white"
              >
                Abrir no WhatsApp
              </a>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
