"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { canManage, requireMembership } from "@/lib/auth";
import { normalizePhone } from "@/lib/channels/phone";
import { signBody } from "@/lib/channels/signature";
import {
  historyChunk,
  inboundText,
  messageEcho,
  partnerRemoved,
  statusUpdate,
} from "@/lib/channels/whatsapp/fixtures";
import { getWhatsAppProviderName } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { processWebhookEvents } from "@/lib/webhooks/process";
import { receiveWebhook } from "@/lib/webhooks/receive";
import { supabaseEventStore, webhookSecret } from "@/lib/webhooks/store";

export interface SimulatorState {
  status: "idle" | "error" | "success";
  message?: string;
}

type Kind = "inbound" | "echo" | "read" | "history" | "partner_removed";

/**
 * Mock mode only. Builds a Cloud API shaped payload, signs it and runs it
 * through the same intake + processing pipeline as the real webhook route.
 */
export async function simulateAction(_prev: SimulatorState, formData: FormData): Promise<SimulatorState> {
  const me = await requireMembership();
  if (getWhatsAppProviderName() !== "mock") return { status: "error", message: "Disponível só com WHATSAPP_PROVIDER=mock." };
  if (!canManage(me.role)) return { status: "error", message: "Apenas donos e administradores usam o simulador." };

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("channel_accounts")
    .select("id, external_account_id, external_business_id")
    .eq("organization_id", me.organizationId)
    .eq("provider", "mock")
    .maybeSingle();
  if (!account) return { status: "error", message: "Conecte o WhatsApp de teste em Ajustes primeiro." };

  const kind = String(formData.get("kind") ?? "inbound") as Kind;
  const phone = normalizePhone(String(formData.get("phone") ?? "")) ?? "5548999990000";
  // WhatsApp often reports BR mobiles without the 9th digit: simulate that.
  const waId = /^55\d{2}9\d{8}$/.test(phone) ? phone.slice(0, 4) + phone.slice(5) : phone;
  const name = String(formData.get("name") ?? "").trim() || "Cliente teste";
  const body = String(formData.get("body") ?? "").trim() || "Oi! Tem horário amanhã?";
  const base = { phoneNumberId: account.external_account_id };
  const id = () => `wamid.sim.${randomUUID()}`;

  let payload: unknown;
  switch (kind) {
    case "inbound":
      payload = inboundText({ ...base, from: waId, name, body, id: id() });
      break;
    case "echo":
      payload = messageEcho({ ...base, to: waId, body, id: id() });
      break;
    case "read": {
      const { data: last } = await supabase
        .from("messages")
        .select("external_message_id")
        .eq("channel_account_id", account.id)
        .eq("direction", "outbound")
        .not("external_message_id", "is", null)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!last?.external_message_id) return { status: "error", message: "Nenhuma mensagem enviada para marcar como lida." };
      payload = statusUpdate({ ...base, id: last.external_message_id, to: waId, status: "read" });
      break;
    }
    case "history": {
      const now = Date.now();
      payload = historyChunk({
        ...base,
        phase: 0,
        chunkOrder: 1,
        progress: 100,
        threads: [
          {
            userId: "554898887777",
            messages: [
              { id: id(), fromBusiness: false, body: "Quanto fica o corte?", at: new Date(now - 3 * 86_400_000) },
              { id: id(), fromBusiness: true, body: "R$ 45, quer marcar?", at: new Date(now - 3 * 86_400_000 + 600_000) },
            ],
          },
          {
            userId: "5548997776666",
            messages: [{ id: id(), fromBusiness: false, body: "Obrigada, amei!", at: new Date(now - 40 * 86_400_000) }],
          },
        ],
      });
      break;
    }
    case "partner_removed":
      payload = partnerRemoved({ wabaId: account.external_business_id ?? undefined, reason: "ACCOUNT_DISCONNECTED" });
      break;
    default:
      return { status: "error", message: "Tipo de simulação inválido." };
  }

  const rawBody = JSON.stringify(payload);
  const secret = webhookSecret("mock");
  const received = await receiveWebhook(
    { provider: "mock", channel: "whatsapp", rawBody, signature: signBody(rawBody, secret), secret },
    supabaseEventStore(),
  );
  if (received.status !== 200 || !received.eventId) return { status: "error", message: "O webhook recusou o evento." };

  const result = await processWebhookEvents({ ids: [received.eventId] });
  refresh();
  return result.failed > 0
    ? { status: "error", message: "O evento foi gravado mas falhou no processamento. Ele será reprocessado." }
    : { status: "success", message: "Evento recebido e processado." };
}
