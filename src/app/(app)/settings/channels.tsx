import { Icon } from "@/components/icons";
import { Alert, Badge, Button, Panel, type Tone } from "@/components/ui";
import { getChatProConfig, getChatProWebhookUrl } from "@/lib/channels/chatpro/config";
import { canManage, requireMembership } from "@/lib/auth";
import { getWhatsAppProviderName } from "@/lib/env";
import { listChannelAccounts } from "@/lib/inbox/queries";
import { connectMetaNumberAction, connectMockChannelAction } from "./channel-actions";
import { ChatProConnect } from "./chatpro-connect";

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Conectando", tone: "info" },
  active: { label: "Conectado", tone: "success" },
  disconnected: { label: "Desconectado", tone: "warning" },
  error: { label: "Com erro", tone: "danger" },
};

const PROVIDER_LABEL = { mock: "Teste (simulado)", meta: "API oficial da Meta", coexy: "Integração removida", chatpro: "ChatPro (QR Code)" } as const;

async function chatProSection(organizationId: string) {
  const config = getChatProConfig();
  if (!config.instanceId || !config.token || !config.webhookSecret) {
    return (
      <Alert tone="warning" title="ChatPro ainda não configurado">
        Preencha CHATPRO_INSTANCE_ID, CHATPRO_TOKEN e CHATPRO_WEBHOOK_SECRET nas variáveis do servidor.
      </Alert>
    );
  }
  if (config.organizationId !== organizationId) {
    return (
      <Alert tone="info" title="Esta instância não está ligada a este negócio">
        Para usar o número aqui, defina no servidor: CHATPRO_ORGANIZATION_ID={organizationId}
      </Alert>
    );
  }
  return (
    <div className="grid gap-4">
      <Alert tone="warning" title="Conexão por QR Code, fora da API oficial da Meta">
        O WhatsApp pode restringir ou bloquear o número, principalmente com envio em massa. Use para conversas com os seus
        clientes. O celular precisa continuar com o WhatsApp instalado e conectado.
      </Alert>
      <ChatProConnect webhookUrl={getChatProWebhookUrl().url} />
    </div>
  );
}

export async function Channels() {
  const me = await requireMembership();
  const accounts = (await listChannelAccounts(me.organizationId)).filter((a) => a.channel === "whatsapp");
  const manage = canManage(me.role);
  const provider = getWhatsAppProviderName();
  const disconnected = accounts.find((a) => a.status === "disconnected");

  return (
    <Panel
      title="WhatsApp"
      description="O número que recebe as mensagens dos clientes e envia as respostas da inbox."
    >
      <div className="grid gap-4">
        {accounts.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {accounts.map((a) => {
              const status = STATUS[a.status] ?? STATUS.pending!;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="grid size-10 place-items-center rounded-full bg-success/10 text-success">
                    <Icon name="phone" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.display_phone ?? a.display_name ?? "Número em conexão"}</p>
                    <p className="truncate text-xs text-text-muted">
                      {PROVIDER_LABEL[a.provider]}
                      {a.history_sync_progress !== null && a.history_sync_progress < 100
                        ? ` · Importando histórico: ${a.history_sync_progress}%`
                        : ""}
                    </p>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">Nenhum número conectado ainda.</p>
        )}

        {disconnected ? (
          <Alert tone="warning" title="A conexão foi removida">
            Mensagens novas não chegam até você reconectar. As conversas antigas continuam salvas.
          </Alert>
        ) : null}

        {!manage ? (
          <p className="text-sm text-text-muted">Apenas donos e administradores podem conectar ou trocar o número.</p>
        ) : provider === "chatpro" ? (
          await chatProSection(me.organizationId)
        ) : provider === "mock" ? (
          <form action={connectMockChannelAction} className="grid gap-2 rounded-lg bg-background p-4">
            <p className="text-sm font-medium">Ambiente de desenvolvimento</p>
            <p className="text-sm text-text-muted">
              Conecta um número simulado para testar a inbox sem conta na Meta. Use o Simulador para receber mensagens.
            </p>
            <div>
              <Button type="submit" variant={accounts.length === 0 ? "primary" : "secondary"}>
                {accounts.some((a) => a.provider === "mock") ? "Reconectar número de teste" : "Conectar número de teste"}
              </Button>
            </div>
          </form>
        ) : (
          <form action={connectMetaNumberAction} className="grid gap-2 rounded-lg bg-background p-4">
            <p className="text-sm font-medium">Número configurado na Meta</p>
            <p className="text-sm text-text-muted">
              Liga a este negócio o número configurado no servidor. Ele funciona só pela API oficial: não fica em nenhum app
              WhatsApp no celular, e as respostas saem por aqui.
            </p>
            <div>
              <Button type="submit" variant={accounts.length === 0 ? "primary" : "secondary"}>
                {accounts.some((a) => a.provider === "meta") ? "Atualizar número" : "Conectar número"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Panel>
  );
}
