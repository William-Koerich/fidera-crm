"use client";

import { useActionState, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, cx } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea, fieldA11y } from "@/components/ui/field";
import { KeepValuesForm } from "@/components/ui/keep-values-form";
import type { CampaignReplyFormat } from "@/lib/campaigns/config";
import { findCampaign } from "@/lib/campaigns/match";
import { GreetingAudioField } from "../respostas/greeting-audio-field";
import { deleteCampaignFormAction, saveCampaignAction, type CampaignFormState } from "./actions";

export interface CampaignItem {
  id: string;
  name: string;
  triggerText: string;
  labelId: string | null;
  labelName: string | null;
  labelColor: string | null;
  replyFormat: CampaignReplyFormat;
  replyText: string;
  replyAudioPath: string | null;
  replyAudioUrl: string | null;
  enabled: boolean;
  contacts: number;
}

export interface LabelOption {
  id: string;
  name: string;
  color: string;
}

const REPLY_LABEL: Record<CampaignReplyFormat, string> = {
  none: "Só etiqueta",
  text: "Responde com texto",
  audio: "Responde com áudio",
};

export function CampaignsManager({ campaigns, labels }: { campaigns: CampaignItem[]; labels: LabelOption[] }) {
  const [editing, setEditing] = useState<CampaignItem | "new" | null>(null);

  if (editing) {
    return <CampaignForm key={editing === "new" ? "new" : editing.id} campaign={editing === "new" ? null : editing} labels={labels} onDone={() => setEditing(null)} />;
  }

  return (
    <div className="grid gap-4">
      <div>
        <Button onClick={() => setEditing("new")}>Nova campanha</Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon="message"
          title="Nenhuma campanha ainda"
          description="Cadastre a mensagem que o anúncio pede para o cliente mandar. Quem mandar ganha a etiqueta da campanha e, se você quiser, uma resposta só dela."
        />
      ) : (
        <ul className="grid gap-3">
          {campaigns.map((c) => (
            <li key={c.id} className={cx("rounded-[var(--radius-card)] bg-surface p-4 shadow-sm ring-1 ring-border/70 sm:p-5", !c.enabled && "opacity-70")}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-medium">{c.name}</h3>
                    {!c.enabled ? <Badge tone="neutral">Pausada</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-text-muted">“{c.triggerText}”</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {c.labelName ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 font-medium">
                        <span aria-hidden className="size-2.5 rounded-full" style={{ background: c.labelColor ?? undefined }} />
                        {c.labelName}
                      </span>
                    ) : (
                      <span className="rounded-full bg-sunken px-2.5 py-1 text-text-muted">Sem etiqueta</span>
                    )}
                    <span className="rounded-full bg-sunken px-2.5 py-1 text-text-muted">{REPLY_LABEL[c.replyFormat]}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl font-medium tabular">{c.contacts}</p>
                  <p className="text-xs text-text-muted">{c.contacts === 1 ? "contato" : "contatos"}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(c)}>
                  Editar
                </Button>
                <ConfirmDialog
                  trigger="Excluir"
                  title={`Excluir a campanha "${c.name}"?`}
                  description="As mensagens deixam de ser reconhecidas. Os contatos continuam com a etiqueta, e as conversas não mudam."
                  confirmLabel="Excluir campanha"
                  action={deleteCampaignFormAction}
                  fields={{ id: c.id }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {campaigns.length > 0 ? <MatchTester campaigns={campaigns} /> : null}
    </div>
  );
}

/** Paste a message to see which campaign would catch it, before running the ad. */
function MatchTester({ campaigns }: { campaigns: CampaignItem[] }) {
  const [text, setText] = useState("");
  const match = text.trim() ? findCampaign(text, campaigns.filter((c) => c.enabled)) : null;
  return (
    <div className="grid gap-2 rounded-[var(--radius-card)] bg-sunken/70 p-4 sm:p-5">
      <Field id="campaign-test" label="Testar uma mensagem" hint="Cole uma mensagem como o cliente mandaria, para ver qual campanha reconhece.">
        <Textarea {...fieldA11y("campaign-test", { hint: true })} value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Bom dia! Quero saber mais sobre o curso de unhas" />
      </Field>
      {text.trim() ? (
        <p role="status" className={cx("flex items-center gap-2 text-sm font-medium", match ? "text-success" : "text-text-muted")}>
          <Icon name={match ? "check" : "info"} className="size-4" />
          {match ? `Reconhecida: ${match.name}` : "Nenhuma campanha ativa reconhece esta mensagem."}
        </p>
      ) : null}
    </div>
  );
}

function CampaignForm({ campaign, labels, onDone }: { campaign: CampaignItem | null; labels: LabelOption[]; onDone: () => void }) {
  const [state, action, pending] = useActionState<CampaignFormState, FormData>(saveCampaignAction, { status: "idle" });
  const [label, setLabel] = useState(campaign ? (campaign.labelId ?? "") : labels.length ? "" : "new");
  const [format, setFormat] = useState<CampaignReplyFormat>(campaign?.replyFormat ?? "none");

  useEffect(() => {
    if (state.status === "saved") onDone();
  }, [state, onDone]);

  return (
    <KeepValuesForm action={action} className="grid gap-5 rounded-[var(--radius-card)] bg-surface p-4 shadow-sm ring-1 ring-border/70 sm:p-6">
      <h2 className="font-display text-xl font-medium">{campaign ? `Editar "${campaign.name}"` : "Nova campanha"}</h2>
      {campaign ? <input type="hidden" name="id" value={campaign.id} /> : null}

      <Field id="campaign-name" label="Nome da campanha" hint="Só para você, o cliente não vê.">
        <Input {...fieldA11y("campaign-name", { hint: true })} name="name" defaultValue={campaign?.name ?? ""} maxLength={80} placeholder="Curso de unhas em gel" />
      </Field>

      <Field
        id="campaign-trigger"
        label="Mensagem que o cliente envia"
        hint="Copie a mensagem pronta do anúncio ou do link. Maiúsculas, acentos, pontuação e emojis não importam, e o cliente pode escrever algo antes ou depois."
      >
        <Textarea
          {...fieldA11y("campaign-trigger", { hint: true })}
          name="trigger_text"
          defaultValue={campaign?.triggerText ?? ""}
          maxLength={1000}
          rows={3}
          placeholder="Olá! Quero saber mais sobre o curso de unhas em gel"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="campaign-label" label="Etiqueta no contato">
          <Select id="campaign-label" name="label_id" value={label} onChange={(e) => setLabel(e.target.value)}>
            <option value="">Nenhuma</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="new">+ Criar nova etiqueta</option>
          </Select>
        </Field>
        {label === "new" ? (
          <Field id="campaign-new-label" label="Nome da nova etiqueta">
            <Input id="campaign-new-label" name="new_label_name" maxLength={40} defaultValue={campaign?.name ?? ""} placeholder="Curso unhas" />
          </Field>
        ) : null}
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Resposta automática</legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {(["none", "text", "audio"] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
            >
              <input type="radio" name="reply_format" value={value} checked={format === value} onChange={() => setFormat(value)} className="size-4 accent-brand" />
              {value === "none" ? "Não responder" : value === "text" ? "Mensagem escrita" : "Áudio gravado"}
            </label>
          ))}
        </div>
        {format === "none" ? (
          <p className="text-sm text-text-muted">O contato só ganha a etiqueta. A saudação e a IA seguem como sempre.</p>
        ) : (
          <p className="text-sm text-text-muted">
            Vai uma vez por contato, no lugar da saudação. Nessa mensagem a IA não responde por cima; nas próximas, segue normalmente.
          </p>
        )}
        {format === "audio" ? <GreetingAudioField initialPath={campaign?.replyAudioPath ?? null} initialUrl={campaign?.replyAudioUrl ?? null} /> : null}
        {format !== "none" ? (
          <Field
            id="campaign-reply"
            label={format === "audio" ? "Texto de reserva" : "Texto da resposta"}
            optional={format === "audio"}
            hint={format === "audio" ? "Enviado só se o áudio não puder ser enviado." : undefined}
          >
            <Textarea {...fieldA11y("campaign-reply", { hint: format === "audio" })} name="reply_text" defaultValue={campaign?.replyText ?? ""} maxLength={4096} rows={3} />
          </Field>
        ) : null}
      </fieldset>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={campaign?.enabled ?? true} className="size-5 accent-brand" />
        Campanha ativa
      </label>

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          Salvar campanha
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </KeepValuesForm>
  );
}
