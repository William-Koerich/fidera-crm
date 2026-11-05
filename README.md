# Fidera CRM

WhatsApp and Instagram CRM for salons and barbershops. See [PLANO.md](PLANO.md) for scope and phases.

Stack: Next.js (App Router), strict TypeScript, Supabase, Vercel.

## Setup

```bash
cp .env.example .env.local   # fill in the Supabase values
npm install
npm run dev
```

`WHATSAPP_PROVIDER=mock` (default) runs everything without a Meta account.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (no network) |
| `npm run test:db` | RLS isolation tests against `DATABASE_URL` (each test runs in a transaction that is rolled back) |
| `npm run db:status` / `db:migrate` | List / apply migrations in `supabase/migrations` |

## Database

The Supabase project is shared with other apps, so all CRM objects live in the
`crm` schema (exposed to the Data API) and `crm_private` (helpers, not exposed).
Migrations are applied by `scripts/migrate.mts`, which keeps its own history in
`crm_private.schema_migrations` and does not touch `supabase_migrations`.

## Trying the inbox without Meta (mock mode)

1. In the Supabase dashboard, add `crm` to *Settings → Data API → Exposed schemas*,
   and add `http://localhost:3000/**` to *Authentication → URL Configuration → Redirect URLs*.
2. `npm run dev`, open http://localhost:3000, create an account and your business.
3. *Ajustes → Conectar WhatsApp de teste*.
4. *Simulador → Cliente envia mensagem*: the conversation shows up in the inbox
   (Realtime), with the "Sem resposta" badge and the 24h window countdown.
5. Reply from the conversation screen (goes through `MockChannelProvider`),
   or simulate a reply from the phone (echo), a read receipt, a history import
   or a disconnection (`PARTNER_REMOVED`).

The simulator signs Cloud API shaped payloads and sends them through the same
intake + processing code as `POST /api/webhooks/whatsapp`.

## WhatsApp providers

`WHATSAPP_PROVIDER` selects how WhatsApp is reached. Everything after the
webhook (queue, ingestion, inbox) is the same for all of them.

| Value | What it is | Webhook route | Signature header |
| --- | --- | --- | --- |
| `mock` (default) | In-memory provider + simulator, no account needed | `/api/webhooks/whatsapp` | `X-Hub-Signature-256` (`MOCK_WEBHOOK_SECRET`) |
| `meta` | Cloud API directly (e.g. Meta's free test number) | `/api/webhooks/whatsapp` | `X-Hub-Signature-256` (`META_APP_SECRET`) |
| `coexy` | Official Cloud API through Coexy, with WhatsApp Business app coexistence | `/api/webhooks/coexy` | `X-Coexy-Signature` (`COEXY_WEBHOOK_SECRET`) |

### Coexy setup

1. Deploy the app (the webhook needs a public https URL).
2. Set `COEXY_API_KEY` (Coexy panel → Configurações → API Keys) and `WHATSAPP_PROVIDER=coexy`.
3. Create the webhook once and save the printed secret as `COEXY_WEBHOOK_SECRET`:
   `node --env-file=.env.local scripts/coexy-webhook.mts https://<your-app>`
4. In the app: *Ajustes → Conectar WhatsApp Business*. The owner finishes the
   connection on Coexy's page, comes back and taps *Já conectei, verificar*.

Channel tokens are stored per account in Supabase Vault (`crm.set_channel_token`).
