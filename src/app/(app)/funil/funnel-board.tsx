"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LabelChip } from "@/components/label-chip";
import { Icon } from "@/components/icons";
import { Avatar, cx } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { formatPhone, formatShortDate } from "@/lib/inbox/format";
import type { LabelInfo } from "@/lib/labels/stages";
import type { FunnelCard } from "@/lib/labels/funnel";
import { moveContactAction } from "./actions";

const NONE = "none";
const NONE_COLOR = "#8a7f99";

/**
 * Leads by stage. Drag a card to another column, or use "Mover para" on the card (phones,
 * keyboards). The move shows at once and goes back if the server refuses it.
 */
export function FunnelBoard({
  stages,
  columns: initialColumns,
  totals: initialTotals,
  labels,
}: {
  stages: LabelInfo[];
  columns: Record<string, FunnelCard[]>;
  totals: Record<string, number>;
  labels: LabelInfo[];
}) {
  const [columns, setColumns] = useState(initialColumns);
  const [totals, setTotals] = useState(initialTotals);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const labelById = new Map(labels.map((l) => [l.id, l]));

  const order = [{ id: NONE, name: "Sem etapa", color: NONE_COLOR }, ...stages];
  const nameOf = (id: string) => order.find((c) => c.id === id)?.name ?? "";

  const columnOf = (contactId: string, state = columns) => Object.keys(state).find((key) => state[key]!.some((c) => c.contactId === contactId));

  const move = (contactId: string, to: string) => {
    const from = columnOf(contactId);
    if (!from || from === to) return;
    const card = columns[from]!.find((c) => c.contactId === contactId)!;
    const before = { columns, totals };
    setColumns((current) => ({
      ...current,
      [from]: current[from]!.filter((c) => c.contactId !== contactId),
      [to]: [{ ...card, since: new Date().toISOString() }, ...(current[to] ?? [])],
    }));
    setTotals((current) => ({ ...current, [from]: Math.max(0, (current[from] ?? 1) - 1), [to]: (current[to] ?? 0) + 1 }));
    startTransition(async () => {
      const result = await moveContactAction(contactId, to === NONE ? null : to).catch(() => null);
      if (result?.status !== "saved") {
        setColumns(before.columns);
        setTotals(before.totals);
        toast(result?.notice ?? "Não foi possível mover. Tente de novo.", "danger");
        return;
      }
      toast(result.notice ?? `${card.name || formatPhone(card.phone) || "Contato"} → ${nameOf(to)}`, result.notice ? "info" : "success");
    });
  };

  return (
    <div className="-mx-4 flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:snap-none">
      {order.map((column) => {
        const cards = columns[column.id] ?? [];
        const isOver = over === column.id && dragging !== null && columnOf(dragging) !== column.id;
        return (
          <section
            key={column.id}
            aria-label={`${column.name}: ${totals[column.id] ?? 0}`}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver(column.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === column.id ? null : o));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/contact") || dragging;
              setOver(null);
              setDragging(null);
              if (id) move(id, column.id);
            }}
            className={cx(
              "flex w-[85vw] max-w-[19rem] shrink-0 snap-start flex-col rounded-2xl bg-sunken/80 transition-shadow sm:w-72 lg:max-h-full",
              isOver && "ring-2 ring-brand/60",
            )}
          >
            <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: column.color }} />
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{column.name}</h2>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold tabular text-text-muted">{totals[column.id] ?? 0}</span>
            </header>
            {column.id === NONE ? <p className="px-3.5 pb-2 text-xs text-text-muted">Conversas abertas que ainda não estão em nenhuma etapa.</p> : null}
            <ul className="relative grid min-h-24 content-start gap-2 overflow-y-auto overscroll-contain px-2 pb-2 max-lg:max-h-[65dvh]">
              {cards.length === 0 ? (
                <li className="grid min-h-20 place-items-center rounded-xl border border-dashed border-border px-3 text-center text-xs text-text-muted">
                  {column.id === NONE ? "Ninguém esperando uma etapa." : "Arraste um contato para cá."}
                </li>
              ) : null}
              {cards.map((card) => (
                <Card
                  key={card.contactId}
                  card={card}
                  column={column.id}
                  order={order}
                  labelById={labelById}
                  dragging={dragging === card.contactId}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/contact", card.contactId);
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(card.contactId);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  onMove={(to) => move(card.contactId, to)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Card({
  card,
  column,
  order,
  labelById,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: FunnelCard;
  column: string;
  order: { id: string; name: string }[];
  labelById: Map<string, LabelInfo>;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onMove: (to: string) => void;
}) {
  const name = card.name || formatPhone(card.phone) || "Contato";
  const extra = card.labelIds.map((id) => labelById.get(id)).filter((l): l is LabelInfo => !!l);
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cx(
        "group rounded-xl bg-surface p-3 shadow-sm ring-1 ring-border/60 transition lg:cursor-grab lg:active:cursor-grabbing",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={card.name} phone={card.phone} src={card.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            {card.conversationId ? (
              <Link href={`/inbox/${card.conversationId}`} draggable={false} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                {name}
              </Link>
            ) : (
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
            )}
            {card.lastMessageAt ? <span className="shrink-0 text-[11px] text-text-muted tabular">{formatShortDate(card.lastMessageAt)}</span> : null}
          </div>
          {card.lastMessagePreview ? <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{card.lastMessagePreview}</p> : null}
        </div>
      </div>
      {card.awaitingReply || extra.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {card.awaitingReply ? (
            <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-warning">
              <Icon name="alert" className="size-3" />
              Sem resposta
            </span>
          ) : null}
          {extra.map((label) => (
            <LabelChip key={label.id} name={label.name} color={label.color} size="xs" className="max-w-[8rem]" />
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2">
        <label htmlFor={`move-${card.contactId}`} className="text-[11px] text-text-muted">
          Mover para
        </label>
        <select
          id={`move-${card.contactId}`}
          value={column}
          onChange={(e) => onMove(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs"
        >
          {order.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id === "none" ? "Sem etapa" : o.name}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}
