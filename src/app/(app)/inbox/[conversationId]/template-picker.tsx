"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { listTemplatesAction, sendTemplateAction, type TemplateOption } from "../actions";

/**
 * With the 24h window closed on a number on Meta's official API, the only way to
 * write is an approved template. Lists the number's templates to pick and send.
 */
export function TemplatePicker({ conversationId }: { conversationId: string }) {
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  useEffect(() => {
    let alive = true;
    listTemplatesAction(conversationId).then((list) => {
      if (!alive) return;
      setTemplates(list);
      setSelected(list[0] ? keyOf(list[0]) : "");
    });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const chosen = templates?.find((t) => keyOf(t) === selected) ?? null;

  if (templates === null) return <p className="text-sm text-text-muted">Buscando os modelos aprovados…</p>;
  if (templates.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        A janela de 24h fechou. Para retomar a conversa, crie e aprove um modelo de mensagem no ChatPro. Ele aparece aqui para enviar.
      </p>
    );
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!chosen) return;
        setError(null);
        startSending(async () => {
          const result = await sendTemplateAction({ conversationId, name: chosen.name, languageCode: chosen.languageCode });
          if (result.status === "error") setError(result.message ?? "O envio falhou. Tente de novo.");
        });
      }}
    >
      <p className="text-sm text-text-muted">A janela de 24h fechou. Envie um modelo aprovado para retomar a conversa.</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <label htmlFor="template" className="sr-only">
            Modelo de mensagem
          </label>
          <Select id="template" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {templates.map((t) => (
              <option key={keyOf(t)} value={keyOf(t)}>
                {t.name} ({t.languageCode})
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" loading={sending} disabled={!chosen}>
          Enviar modelo
        </Button>
      </div>
      {chosen?.body ? <p className="rounded-xl bg-sunken px-3 py-2 text-sm whitespace-pre-line">{chosen.body}</p> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </form>
  );
}

const keyOf = (t: TemplateOption) => `${t.name}|${t.languageCode}`;
