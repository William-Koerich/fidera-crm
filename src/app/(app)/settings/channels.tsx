import { Button, Card, Notice } from "@/components/ui";
import { canManage, requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { listChannelAccounts } from "@/lib/inbox/queries";
import { connectMockChannelAction } from "./channel-actions";

const STATUS_LABEL = {
  pending: "Conectando",
  active: "Conectado",
  disconnected: "Desconectado",
  error: "Com erro",
} as const;

export async function Channels() {
  const me = await requireMembership();
  const accounts = await listChannelAccounts(me.organizationId);
  const manage = canManage(me.role);
  const mock = getWhatsAppProviderName() === "mock";

  return (
    <Card title="Canais">
      {accounts.length > 0 ? (
        <ul className="mb-3 grid gap-2">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {a.channel === "whatsapp" ? "WhatsApp" : "Instagram"} · {a.display_name ?? a.display_phone ?? "Conta"}
                  {a.provider === "mock" ? " (teste)" : ""}
                </p>
                <p className="text-xs text-text-muted">
                  {a.display_phone}
                  {a.history_sync_progress !== null && a.history_sync_progress < 100
                    ? ` · Histórico: ${a.history_sync_progress}%`
                    : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  a.status === "active" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                }`}
              >
                {STATUS_LABEL[a.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-text-muted">Nenhum canal conectado.</p>
      )}

      {accounts.some((a) => a.status === "disconnected") ? (
        <div className="mb-3">
          <Notice tone="warning">
            A conexão com o WhatsApp foi removida. Mensagens novas não chegam até reconectar.
          </Notice>
        </div>
      ) : null}

      {manage && mock ? (
        <form action={connectMockChannelAction}>
          <Button type="submit" variant={accounts.length === 0 ? "primary" : "secondary"} className="w-full">
            {accounts.some((a) => a.provider === "mock") ? "Reconectar WhatsApp de teste" : "Conectar WhatsApp de teste"}
          </Button>
          <p className="mt-2 text-xs text-text-muted">
            Modo de desenvolvimento (WHATSAPP_PROVIDER=mock): use o Simulador para receber mensagens falsas.
          </p>
        </form>
      ) : null}
    </Card>
  );
}
