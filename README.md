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
webhook (queue, ingestion, inbox) is the same for both.

| Value | What it is | Webhook route | Signature |
| --- | --- | --- | --- |
| `mock` (default) | In-memory provider + simulator, no account needed | `/api/webhooks/whatsapp` | `X-Hub-Signature-256` with `MOCK_WEBHOOK_SECRET` |
| `meta` | Official Cloud API, e.g. the free test number of a Meta developer app | `/api/webhooks/whatsapp` | `X-Hub-Signature-256` with `META_APP_SECRET` |

### Free testing with the Meta test number

No payment method is needed for the developer app's test number.

1. Create a Meta developer account and an app with the WhatsApp product
   (developers.facebook.com). In *WhatsApp → API Setup* copy the test
   number's **Phone number ID**, the **WhatsApp Business Account ID**, and a
   temporary access token, and add up to 5 recipient phone numbers.
2. In `.env.local`:
   ```bash
   WHATSAPP_PROVIDER=meta
   META_WHATSAPP_TOKEN=...            # access token (temporary or system user)
   META_APP_SECRET=...                # App settings -> Basic -> App secret
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=...  # any random string
   META_PHONE_NUMBER_ID=...
   META_WABA_ID=...
   META_DISPLAY_PHONE=+1 555 ...
   ```
3. Expose the app over https (deploy to Vercel, or a free tunnel such as
   `cloudflared tunnel --url http://localhost:3000`) and, in *WhatsApp →
   Configuration*, set the callback URL to `https://<host>/api/webhooks/whatsapp`
   with the same verify token. Subscribe to the `messages` field.
4. In the app: *Ajustes → Canais → Conectar número*.
5. From one of the verified phones, send a message to the test number. It shows
   up in the inbox and opens the 24h window, so you can reply from the app.

### Real number on Cloud API (no WhatsApp app on the phone)

The number lives only on Cloud API and replies go out through Fidera. Use a
number that is not in the regular WhatsApp app. Numbers are registered without
coexistence, which needs a Meta Tech Provider or Solution Partner.

1. In WhatsApp Manager, add the number and verify it with the SMS or voice code.
2. Create a system user token and fill in the variables above with the real
   number's IDs.
3. Register the number and subscribe the app (run once):
   `META_REGISTER_PIN=<6 digits> npm run meta:setup`
4. Set the webhook as in step 3 above, then connect it in *Ajustes → Canais*.

Replies only work inside the 24h window: template messages are not implemented yet.

Channel tokens can also be stored per account in Supabase Vault (`crm.set_channel_token`).
