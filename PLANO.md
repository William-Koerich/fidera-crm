# Plano de implementação: CRM de WhatsApp e Instagram para pequenos negócios

Versão de 4 de novembro de 2026. Antes de implementar integrações com a Meta, confira a documentação oficial atual.

## 1. Objetivo

Criar um SaaS multiempresa para salões e barbearias que centraliza WhatsApp e Instagram e responde todos os dias à pergunta: **quem eu preciso chamar hoje?**

A inbox é a base. O diferencial é trazer clientes de volta com regras de retorno por serviço.

Stack obrigatória: Next.js (App Router), TypeScript estrito, Supabase e Vercel.

## 2. Escopo do MVP

Incluído:

- Inbox única de WhatsApp e Instagram, otimizada para celular e instalável como PWA.
- Criação e atualização automática de contatos a partir das conversas, com origem.
- Alerta de contatos sem resposta e tempo restante da janela de resposta.
- Página de captação e QR Code com origem rastreável.
- Serviços, regras de retorno e registro rápido de visitas.
- Lista diária "Chamar hoje" com mensagem pronta.
- Relatório mensal: chamados, respostas em até 7 dias e valor estimado recuperado.
- Consentimento, descadastro, registro de uso e custo por negócio.

Fora do MVP: financeiro, estoque, comissões, disparo em massa e IA automática.

Decisões do dono do produto em 6 de novembro de 2026: entram no produto a agenda do salão, com agendamento a partir das datas citadas na conversa, e o chatbot com fluxo.

Meta de onboarding: gerar a primeira lista útil em até 10 minutos após conectar.

## 3. Regras de canal

### WhatsApp

- Produção: usar somente a Cloud API oficial.
- Cliente final conecta por Embedded Signup com coexistência, na versão atual do fluxo.
- O dono continua usando o WhatsApp Business no celular.
- A ação padrão da lista "Chamar hoje" abre o WhatsApp com texto pronto, para evitar a tarifa de envio pela API.
- Tratar `smb_message_echoes`, para mostrar na inbox o que foi enviado pelo celular.
- Implementar `history` e `smb_app_state_sync`. Mensagens em massa de histórico devem ser processadas em lotes.
- Tratar `account_update` com `PARTNER_REMOVED` e alertar o dono.
- Avisar antes da conexão que listas de transmissão ficam desativadas e grupos não são sincronizados.
- Não colocar envio em massa no MVP.

### Instagram

- Usar a API com Instagram Login.
- Respeitar a janela padrão de 24h.
- Usar a tag Human Agent, até 7 dias, somente em respostas humanas e somente após aprovação.
- Não iniciar conversa fria. Usar o canal para responder e pedir telefone.
- Apagar mensagens localmente ao receber o aviso correspondente por webhook.

### Custos de referência no Brasil

Valores a confirmar na tabela oficial antes de calcular preços:

| Envio | Custo Meta |
| --- | --- |
| Pelo app WhatsApp Business | Gratuito |
| Resposta pela API dentro da janela | 1.000 grátis por número ao mês; depois R$ 0,0350 |
| Template utilitário | R$ 0,0350; tratar como pago mesmo dentro da janela |
| Template de marketing | R$ 0,3217 |

Registrar no `usage_ledger` a categoria e o custo estimado de cada envio pela API.

## 4. Estratégia de testes sem custo

Implementar nesta ordem:

1. **Mock local:** `MockChannelProvider`, fixtures de webhooks e testes automatizados. É o caminho padrão de desenvolvimento e não exige conta na Meta.
2. **Número de teste da Meta:** usar o número gratuito do app de desenvolvedor, com até 5 destinatários verificados, para validar envio, recebimento e assinatura de webhook.
3. **Instagram próprio:** usar uma conta profissional própria com acesso padrão.
4. **Coexistência real:** somente depois da verificação da empresa e da aprovação como Tech Provider. Até lá, testar com fixtures baseadas na documentação.

Não adicionar `whatsapp-web.js`, Baileys ou outro cliente não oficial ao produto. Eles exigem processo persistente, não rodam no modelo serverless da Vercel e podem levar ao bloqueio do número.

Variável de ambiente:

```bash
WHATSAPP_PROVIDER=mock # mock | meta
```

## 5. Arquitetura

Fluxo de entrada:

1. A Meta chama o webhook no Next.js.
2. O webhook valida `X-Hub-Signature-256` usando o corpo bruto.
3. O evento é gravado em `webhook_events`, sem duplicar.
4. O webhook responde rápido.
5. O processamento ocorre em seguida com `after()`.
6. Uma varredura com `pg_cron` reprocessa pendências.
7. Histórico e cargas grandes vão para fila em lotes.
8. O worker normaliza eventos e grava contatos, conversas, mensagens e mídia.
9. O app recebe atualizações por Supabase Realtime.

Fluxo de saída:

- Resposta pela inbox: Server Action ou rota no servidor -> `ChannelProvider` -> Meta.
- Lista "Chamar hoje": abre o WhatsApp no celular com texto pronto -> a mensagem volta como echo.

Interface inicial:

```ts
export interface ChannelProvider {
  parseWebhook(payload: unknown): NormalizedEvent[];
  sendMessage(input: SendMessageInput): Promise<SendResult>;
  getReplyWindow(conversation: Conversation): ReplyWindow;
}
```

Decisões obrigatórias:

- `organization_id` e RLS em todas as tabelas de negócio desde a primeira migration.
- Testes automatizados provando o isolamento entre organizações.
- Índice único em `channel_account_id` + `external_message_id`.
- Tokens criptografados, usados somente no servidor. Nunca expor `service_role` ao cliente.
- Mídia em bucket privado, com URLs assinadas.
- Paginação por cursor na inbox.
- Logs sem conteúdo de mensagens, tokens ou dados pessoais desnecessários.
- Telefone não pode ser chave primária. Guardar o identificador original do canal e uma versão normalizada, considerando o nono dígito brasileiro.

## 6. Modelo de dados inicial

| Tabela | Finalidade |
| --- | --- |
| `organizations`, `memberships` | Negócios, usuários e papéis |
| `channel_accounts` | Conta conectada, IDs externos, status e referência ao token |
| `contacts`, `contact_identities` | Pessoa e identificadores por canal |
| `conversations` | Contato, canal, último recebimento, fim da janela, responsável |
| `messages` | Direção, origem, tipo, conteúdo, mídia, status, IDs externos |
| `services`, `return_rules` | Serviços e prazos de retorno |
| `visits` | Serviço, data, valor e origem |
| `follow_ups` | Quem chamar, motivo, prazo, canal usado e resultado |
| `capture_links` | Links e QR Codes, com origem e campanha |
| `consents` | Autorização, recusa e descadastro |
| `usage_ledger` | Uso e custo estimado por categoria |
| `webhook_events`, `audit_log` | Eventos brutos e ações sensíveis, com retenção definida |

## 7. Fases

### Fase 1: base e WhatsApp

- Criar o projeto Next.js com TypeScript estrito, lint, testes e CI.
- Configurar Supabase local, migrations e tipos gerados.
- Implementar autenticação, organizações, convites, papéis e RLS.
- Implementar `ChannelProvider` e `MockChannelProvider`.
- Implementar webhook, idempotência, processamento e reprocessamento.
- Criar inbox mobile-first com Realtime.
- Integrar envio e recebimento com o número de teste da Meta.
- Preparar Embedded Signup com coexistência atrás de feature flag.

Pronto quando: os testes passarem, duas organizações ficarem isoladas e um número de teste operar por 7 dias sem perda de mensagens.

### Fase 2: retorno e Instagram

- Criar serviços, regras de retorno e registro de visitas.
- Gerar a lista "Chamar hoje" em job diário.
- Abrir o WhatsApp com mensagem preenchida e registrar o resultado.
- Criar página de captação e QR Code.
- Implementar Instagram no mesmo `ChannelProvider`.
- Criar relatório mensal, consentimento e descadastro.
- Adicionar monitoramento de erros e eventos do produto.

Pronto quando: o fluxo "contato entra -> visita registrada -> retorno sugerido -> resposta medida" funcionar de ponta a ponta.

### Fase 3: piloto pago

- Adicionar cobrança recorrente com Pix e cartão, por uma interface de gateway.
- Criar checklist guiado de conexão e diagnóstico do número.
- Criar painel interno de saúde por organização, sem expor mensagens.
- Ligar a integração real de coexistência após a aprovação da Meta.

Pronto quando: 10 negócios forem atendidos, com pelo menos 5 pagando e 60% usando a lista toda semana.

## 8. Tarefas humanas

O Claude Code não deve executar nem simular estas tarefas. Liste como pendências quando bloquearem o avanço:

- Entrevistar 15 donos e testar o processo manualmente em 3 negócios.
- Preparar CNPJ, site, e-mail de domínio e política de privacidade.
- Fazer a verificação da empresa, o App Review e o cadastro como Tech Provider.
- Criar contas, informar segredos e adicionar formas de pagamento.
- Validar tratamento de dados com advogado especializado em LGPD.

## 9. Forma de trabalho

- Trabalhar em etapas pequenas e testáveis, com um commit por etapa.
- Antes de programar, inspecionar o repositório e apresentar um plano curto da fase.
- Não adicionar dependências sem justificativa.
- Não salvar segredos no repositório. Manter um `.env.example` sem valores reais.
- Confirmar nomes de campos, versões e eventos na documentação oficial da Meta antes de integrar.
- Parar e perguntar antes de ações irreversíveis ou que gerem custo.
- Ao final de cada etapa, informar o que mudou, como testar e quais pendências restam.

## 10. Documentação de referência

- WhatsApp, primeiros passos: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- WhatsApp, preços: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md
- WhatsApp, coexistência: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- WhatsApp, Tech Provider: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers
- Instagram Messaging: https://developers.facebook.com/documentation/business-messaging/instagram-messaging/overview