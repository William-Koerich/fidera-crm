"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Alert, Badge } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { CopyButton } from "@/components/ui/inputs-client";
import { Spinner } from "@/components/ui/spinner";
import {
  checkChatProAction,
  connectChatProAction,
  disconnectChatProAction,
  type ChatProState,
} from "./channel-actions";

const POLL_MS = 5_000;
/** WhatsApp QR Codes expire quickly. */
const QR_REFRESH_MS = 30_000;

/** QR Code connection inside the CRM, with the webhook address to configure in ChatPro. */
export function ChatProConnect({ webhookUrl, webhookIsPublic }: { webhookUrl: string; webhookIsPublic: boolean }) {
  const [state, setState] = useState<ChatProState>({ status: "idle" });
  const [starting, startConnect] = useTransition();
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const connect = useCallback(() => {
    startConnect(async () => setState(await connectChatProAction()));
  }, []);

  // Keeps the status live: on load, while waiting for the scan, and after connecting.
  useEffect(() => {
    let active = true;
    const check = async () => {
      const next = await checkChatProAction().catch(() => null);
      if (!active || !next) return;
      setState((current) =>
        next.status === "waiting" && current.qr ? { ...current, status: "waiting" } : next,
      );
    };
    void check();
    const poll = setInterval(() => void check(), POLL_MS);
    const refreshQr = setInterval(() => {
      if (stateRef.current.qr && stateRef.current.status === "waiting") connect();
    }, QR_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(refreshQr);
    };
  }, [connect]);

  const connected = state.status === "connected";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Conexão com o WhatsApp</p>
          <p className="truncate text-sm text-text-muted">
            {connected ? (state.phone ?? "Número conectado") : "Conecte lendo o QR Code com o celular."}
          </p>
        </div>
        <Badge tone={connected ? "success" : state.status === "waiting" ? "info" : "warning"}>
          {connected ? "Conectado" : state.status === "waiting" ? "Aguardando leitura" : "Desconectado"}
        </Badge>
      </div>

      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

      {!connected && state.qr ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- temporary base64 QR Code */}
          <img src={state.qr} alt="QR Code para conectar o WhatsApp" className="size-64 max-w-full" />
          <p className="max-w-sm text-sm text-text-muted">
            No celular, abra o WhatsApp, toque em <strong>Dispositivos conectados</strong> e depois em{" "}
            <strong>Conectar um dispositivo</strong>. A tela atualiza sozinha.
          </p>
          <p className="inline-flex items-center gap-2 text-xs text-text-muted">
            <Spinner className="size-3.5" /> Aguardando a leitura
          </p>
        </div>
      ) : null}

      {!connected && !state.qr ? (
        <div>
          <Button onClick={connect} loading={starting}>
            Mostrar QR Code
          </Button>
        </div>
      ) : null}

      <div className="grid gap-2 rounded-lg bg-background p-4">
        <p className="text-sm font-medium">Webhook</p>
        <p className="text-sm text-text-muted">
          Este é o endereço que recebe as mensagens. Ele contém um código secreto: não compartilhe.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="chatpro-webhook" className="sr-only">
            Endereço do webhook
          </label>
          <Input id="chatpro-webhook" readOnly value={webhookUrl} onFocus={(e) => e.currentTarget.select()} />
          <CopyButton value={webhookUrl} label="Copiar" className="shrink-0" />
        </div>
        {!webhookIsPublic ? (
          <Alert tone="warning">
            Este endereço só funciona neste computador. O ChatPro precisa de um endereço público com https: publique o app ou
            use um túnel.
          </Alert>
        ) : null}
      </div>

      {connected ? (
        <div>
          <ConfirmDialog
            trigger="Desconectar número"
            title="Desconectar este número?"
            description="O Fidera para de receber e enviar mensagens por este número até você ler o QR Code de novo. As conversas continuam salvas."
            confirmLabel="Desconectar"
            action={async () => {
              setState(await disconnectChatProAction());
            }}
            fields={{}}
          />
        </div>
      ) : null}
    </div>
  );
}
