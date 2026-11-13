"use client";

import { useState, useTransition } from "react";
import { LabelChip } from "@/components/label-chip";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui/cx";
import { useToast } from "@/components/ui/toast";
import { isStage, planLabelChange, type LabelInfo } from "@/lib/labels/stages";
import { createLabelHereAction, toggleLabelAction } from "./label-actions";

/**
 * The contact's stage and labels, always in sight above the messages. One tap opens the picker;
 * one tap on a label turns it on or off. Picking a stage moves the contact out of the other one.
 */
export function LabelBar({
  conversationId,
  labels: initialLabels,
  contactLabelIds,
  canCreate,
}: {
  conversationId: string;
  labels: LabelInfo[];
  contactLabelIds: string[];
  canCreate: boolean;
}) {
  const [labels, setLabels] = useState(initialLabels);
  const [active, setActive] = useState(contactLabelIds);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const stages = labels.filter(isStage);
  const plain = labels.filter((l) => !isStage(l));
  const mine = labels.filter((l) => active.includes(l.id));
  const stage = mine.find(isStage);

  const toggle = (label: LabelInfo, on: boolean) => {
    const previous = active;
    const plan = planLabelChange(labels, active, label.id, on);
    setActive([...active.filter((id) => !plan.remove.includes(id)), ...plan.add]);
    startTransition(async () => {
      const result = await toggleLabelAction(conversationId, label.id, on).catch(() => null);
      if (result?.status !== "saved") {
        setActive(previous);
        toast(result?.notice ?? "Não foi possível salvar. Tente de novo.", "danger");
        return;
      }
      if (result.labelIds) setActive(result.labelIds);
      if (result.notice) toast(result.notice, "info");
    });
  };

  const create = (asStage: boolean) => {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createLabelHereAction(conversationId, name, asStage).catch(() => null);
      if (result?.status !== "saved") {
        toast(result?.notice ?? "Não foi possível criar. Tente de novo.", "danger");
        return;
      }
      const created = result.label;
      if (created) setLabels((current) => (current.some((l) => l.id === created.id) ? current : [...current, created]));
      if (result.labelIds) setActive(result.labelIds);
      setNewName("");
      toast(`"${name}" adicionada`);
    });
  };

  return (
    <div className="shrink-0 border-b border-border bg-background">
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {mine.length === 0 ? <span className="shrink-0 text-xs text-text-muted">Sem etiqueta</span> : null}
        {stage ? <LabelChip name={stage.name} color={stage.color} stage className="shrink-0" /> : null}
        {mine
          .filter((l) => !isStage(l))
          .map((label) => (
            <LabelChip key={label.id} name={label.name} color={label.color} className="shrink-0">
              <button
                type="button"
                aria-label={`Tirar a etiqueta ${label.name}`}
                disabled={pending}
                onClick={() => toggle(label, false)}
                className="-mr-1 grid size-5 place-items-center rounded-full text-text-muted hover:bg-black/10 hover:text-text"
              >
                <Icon name="x" className="size-3" />
              </button>
            </LabelChip>
          ))}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="label-picker"
          onClick={() => setOpen((v) => !v)}
          className={cx(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-dashed px-2.5 text-xs font-medium transition-colors",
            open ? "border-brand bg-brand-soft text-brand" : "border-border text-text-muted hover:border-text-muted hover:text-text",
          )}
        >
          <span aria-hidden className="text-sm leading-none">{open ? "–" : "+"}</span>
          {stages.length > 0 && !stage ? "Etapa" : "Etiqueta"}
        </button>
      </div>

      {open ? (
        <div id="label-picker" className="grid gap-3 border-t border-border bg-surface px-3 py-3 sm:px-4">
          {stages.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-muted">Etapa do funil</p>
              <div role="radiogroup" aria-label="Etapa do funil" className="flex flex-wrap gap-1.5">
                {stages.map((label) => {
                  const on = active.includes(label.id);
                  return (
                    <PickerChip key={label.id} label={label} on={on} role="radio" disabled={pending} onClick={() => toggle(label, !on)} />
                  );
                })}
              </div>
            </div>
          ) : null}

          {plain.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-text-muted">Etiquetas</p>
              <div className="flex flex-wrap gap-1.5">
                {plain.map((label) => {
                  const on = active.includes(label.id);
                  return <PickerChip key={label.id} label={label} on={on} disabled={pending} onClick={() => toggle(label, !on)} />;
                })}
              </div>
            </div>
          ) : null}

          {labels.length === 0 && !canCreate ? (
            <p className="text-sm text-text-muted">Nenhuma etiqueta ainda. Peça a quem administra o salão para criar em Ajustes.</p>
          ) : null}

          {canCreate ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                create(false);
              }}
            >
              <label htmlFor="new-label" className="sr-only">
                Nova etiqueta
              </label>
              <input
                id="new-label"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={40}
                placeholder="Nova etiqueta"
                autoComplete="off"
                className="h-9 min-w-0 flex-1 basis-40 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand"
              />
              <button
                type="submit"
                disabled={pending || !newName.trim()}
                className="h-9 rounded-lg bg-brand px-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Criar
              </button>
              <button
                type="button"
                disabled={pending || !newName.trim()}
                onClick={() => create(true)}
                className="h-9 rounded-lg border border-border px-3 text-sm font-medium text-text disabled:opacity-50"
              >
                Criar como etapa
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PickerChip({
  label,
  on,
  role,
  disabled,
  onClick,
}: {
  label: LabelInfo;
  on: boolean;
  role?: "radio";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? on : undefined}
      aria-pressed={role ? undefined : on}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors disabled:cursor-wait",
        on ? "text-text" : "border-border bg-background text-text-muted hover:text-text",
      )}
      style={on ? { backgroundColor: `color-mix(in oklab, ${label.color} 20%, transparent)`, borderColor: label.color } : undefined}
    >
      <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: label.color }} />
      {label.name}
      {on ? <Icon name="check" className="size-3.5" /> : null}
    </button>
  );
}
