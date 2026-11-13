"use client";

import { useActionState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Alert, Button, Input, Select } from "@/components/ui";
import { KeepValuesForm } from "@/components/ui/keep-values-form";
import { useToast } from "@/components/ui/toast";
import type { LabelInfo } from "@/lib/labels/stages";
import { addStageAction, createSuggestedStagesAction, moveStageAction, removeStageAction, type StageActionState } from "./actions";

/** Managers shape the funnel: order of the stages, add one, take one out. */
export function StageEditor({ stages, plainLabels }: { stages: LabelInfo[]; plainLabels: LabelInfo[] }) {
  const [state, action, adding] = useActionState<StageActionState, FormData>(addStageAction, { status: "idle" });
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const run = (work: () => Promise<StageActionState>) =>
    startTransition(async () => {
      const result = await work().catch(() => null);
      if (result?.status !== "saved") toast(result?.message ?? "Não foi possível salvar.", "danger");
    });

  return (
    <div className="grid gap-4">
      {stages.length > 0 ? (
        <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {stages.map((stage, i) => (
            <li key={stage.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5">
              <span className="w-5 text-xs font-semibold text-text-muted tabular">{i + 1}</span>
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{stage.name}</span>
              <button
                type="button"
                aria-label={`Subir ${stage.name}`}
                disabled={pending || i === 0}
                onClick={() => run(() => moveStageAction(stage.id, -1))}
                className="grid size-9 place-items-center rounded-lg text-text-muted hover:bg-sunken hover:text-text disabled:opacity-30"
              >
                <Icon name="chevron-down" className="size-4 rotate-180" />
              </button>
              <button
                type="button"
                aria-label={`Descer ${stage.name}`}
                disabled={pending || i === stages.length - 1}
                onClick={() => run(() => moveStageAction(stage.id, 1))}
                className="grid size-9 place-items-center rounded-lg text-text-muted hover:bg-sunken hover:text-text disabled:opacity-30"
              >
                <Icon name="chevron-down" className="size-4" />
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => removeStageAction(stage.id))}
                className="h-9 rounded-lg px-2 text-xs font-medium text-danger hover:bg-danger/5"
              >
                Tirar do funil
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      <KeepValuesForm action={action} className="grid gap-2 sm:flex sm:items-end">
        {plainLabels.length > 0 ? (
          <div className="grid gap-1.5 sm:w-56">
            <label htmlFor="stage-existing" className="text-sm font-medium">
              Usar uma etiqueta
            </label>
            <Select id="stage-existing" name="label_id" defaultValue="">
              <option value="">Criar uma nova…</option>
              {plainLabels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="grid flex-1 gap-1.5">
          <label htmlFor="stage-name" className="text-sm font-medium">
            Nome da nova etapa
          </label>
          <Input id="stage-name" name="name" maxLength={40} placeholder="Ex.: Pediu orçamento" autoComplete="off" />
        </div>
        <Button type="submit" variant="secondary" loading={adding}>
          Adicionar etapa
        </Button>
      </KeepValuesForm>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

      {stages.length === 0 ? (
        <div>
          <Button type="button" loading={pending} onClick={() => run(createSuggestedStagesAction)}>
            Criar etapas sugeridas
          </Button>
        </div>
      ) : null}
    </div>
  );
}
