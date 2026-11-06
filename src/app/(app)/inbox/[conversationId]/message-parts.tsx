import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import { formatTime } from "@/lib/inbox/format";
import type { MessageItem } from "@/lib/inbox/queries";
import { MessageText } from "./schedule";

const STATUS: Partial<Record<MessageItem["status"], { icon: "clock" | "check" | "check-double" | "alert"; label: string; className?: string }>> = {
  pending: { icon: "clock", label: "Enviando" },
  sent: { icon: "check", label: "Enviada" },
  delivered: { icon: "check-double", label: "Entregue" },
  read: { icon: "check-double", label: "Lida", className: "text-info" },
  failed: { icon: "alert", label: "Não enviada", className: "text-danger" },
};

const ORIGIN_LABEL: Partial<Record<MessageItem["origin"], string>> = {
  business_app_echo: "pelo celular",
  history: "histórico",
  automation: "automática",
};

export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="my-3 flex justify-center" role="separator" aria-label={label}>
      <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-muted ring-1 ring-border">{label}</span>
    </div>
  );
}

/** Seen only by the team: never sent to the customer. */
export function NoteBubble({ body, at, author }: { body: string; at: string; author: string }) {
  return (
    <div className="mx-auto w-full max-w-[85%] rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2 text-[15px] leading-snug sm:max-w-[70%] sm:text-sm">
      <p className="text-xs font-medium text-warning">Nota interna · o cliente não vê</p>
      <p className="mt-0.5 whitespace-pre-wrap break-words">{body}</p>
      <p className="mt-1 text-right text-[11px] text-text-muted">
        {author} · <time dateTime={at}>{formatTime(at)}</time>
      </p>
    </div>
  );
}

export function MessageBubble({ message: m }: { message: MessageItem }) {
  const outbound = m.direction === "outbound";
  const status = outbound ? STATUS[m.status] : undefined;
  const origin = ORIGIN_LABEL[m.origin];

  return (
    <div className={cx("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug sm:max-w-[70%] sm:text-sm",
          outbound ? "rounded-br-md bg-brand-soft text-text" : "rounded-bl-md bg-surface text-text ring-1 ring-border",
          m.status === "failed" && "ring-1 ring-danger/40",
        )}
      >
        {m.mediaUrl && m.media_mime_type?.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
          <img src={m.mediaUrl} alt="Imagem enviada na conversa" className="-mx-1 mb-1.5 max-h-72 rounded-xl object-contain" />
        ) : m.mediaUrl && m.media_mime_type?.startsWith("audio/") ? (
          <audio controls src={m.mediaUrl} className="mb-1.5 max-w-full" />
        ) : m.mediaUrl && m.media_mime_type?.startsWith("video/") ? (
          <video controls src={m.mediaUrl} className="-mx-1 mb-1.5 max-h-72 max-w-full rounded-xl" />
        ) : m.mediaUrl ? (
          <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-info underline">
            <Icon name="external" className="size-4" />
            Abrir arquivo
          </a>
        ) : m.type !== "text" ? (
          <p className="text-xs font-medium text-text-muted">
            {m.type === "image" ? "Imagem" : m.type === "audio" ? "Áudio" : m.type === "video" ? "Vídeo" : m.type === "document" ? "Documento" : m.type === "sticker" ? "Figurinha" : m.type === "location" ? "Localização" : "Mensagem"}{" "}
            não disponível
          </p>
        ) : null}

        {m.body ? <MessageText text={m.body} sentAt={m.occurred_at} /> : null}

        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-text-muted">
          {origin ? <span>{origin} ·</span> : null}
          <time dateTime={m.occurred_at}>{formatTime(m.occurred_at)}</time>
          {status ? (
            <span className={cx("inline-flex items-center", status.className)} title={status.label}>
              <Icon name={status.icon} className="size-3.5" />
              <span className="sr-only">{status.label}</span>
            </span>
          ) : null}
        </p>
        {m.status === "failed" ? <p className="text-right text-xs font-medium text-danger">Não enviada</p> : null}
      </div>
    </div>
  );
}
