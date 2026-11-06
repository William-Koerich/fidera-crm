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

| Value | What it is | Webhook route | Signature |
| --- | --- | --- | --- |
| `mock` (default) | In-memory provider + simulator, no account needed | `/api/webhooks/whatsapp` | `X-Hub-Signature-256` with `MOCK_WEBHOOK_SECRET` |
| `meta` | Official Cloud API, e.g. the free test number of a Meta developer app | `/api/webhooks/whatsapp` | `X-Hub-Signature-256` with `META_APP_SECRET` |
| `chatpro` | ChatPro API, number linked by QR Code (not Meta's official API) | `/api/webhooks/chatpro/<instance>?token=...` | Secret in the URL (`CHATPRO_WEBHOOK_SECRET`) |

### ChatPro

ChatPro uses two services with separate keys: `oci.chatpro.com.br` for the connection
(status, QR Code, disconnect; `CHATPRO_TOKEN`) and `sparks.chatpro.com.br` for sending
through ChatPro Chat (`CHATPRO_CHAT_TOKEN`). Sending opens the session by number, then
calls `messages/sendMessage`, a route ChatPro support indicated and the public docs omit.

1. Get the instance code and both keys from ChatPro.
2. Set `WHATSAPP_PROVIDER=chatpro`, `CHATPRO_INSTANCE_ID`, `CHATPRO_TOKEN`,
   `CHATPRO_CHAT_TOKEN`, `CHATPRO_WEBHOOK_SECRET` (`openssl rand -hex 32`) and
   `CHATPRO_ORGANIZATION_ID` (*Ajustes -> Canais* shows the value for the current business).
3. Set `CHATPRO_PANEL_EMAIL` and `CHATPRO_PANEL_PASSWORD`, and `NEXT_PUBLIC_SITE_URL`
   with the public https address. *Ajustes -> Canais* then configures the webhook by
   itself. Without them, it shows the address to paste in the ChatPro panel.
4. In *Ajustes -> Canais*, tap *Mostrar QR Code* and scan it with the phone.

*Importar mensagens* in the same screen brings the 1:1 conversations ChatPro Chat holds
into the inbox, one at a time because of its rate limit (429 with no Retry-After). Only
what ChatPro stored comes in, up to 200 messages per conversation.

Contact names and photos come from `get_profile`, then the ChatPro Chat lead: on new
messages (at most weekly per contact), during imports, and from *Atualizar nomes e fotos*.
The name saved on the phone wins over the person's own. Photos are copied to the private
bucket and served by `/api/contacts/<id>/avatar`, which checks access through RLS. Privacy
ids (more than 15 digits, reported as if they were phones) have no name or photo to fetch.

`npm run chatpro:instances` shows the shape of the panel's instance list, with values
masked. It only reads.

ChatPro's docs show no webhook signature, so the secret in the URL is the only
authentication: treat that address as a password. Replies are not limited to a
24h window. Groups are ignored.

### Replies

*Ajustes -> Respostas* manages both kinds, stored in the CRM:

- **Quick replies:** typing `/` in the inbox lists them. A person still sends the message.
- **Automatic replies** (off by default): a greeting on first contact and a message outside
  business hours, sent while processing the webhook. They do not clear "awaiting reply".
  Limits: one away message per conversation in 12 hours, 30 automatic messages per hour per
  business, and only messages under 10 minutes old. Phone replies, imported history and our
  own echoes never trigger them. Import the conversations before enabling the greeting:
  a contact with no conversation in the CRM counts as new.

### Team inbox

*Ajustes -> Atendimento* manages finishing reasons, departments and labels. The CRM is the
record and mirrors each change on ChatPro Chat, with a notice on screen when ChatPro does not
follow. Links to ChatPro records live in `external_id`. Finishing reasons and departments can
be imported from ChatPro; labels cannot, since it has no route to list them. Its docs say
`departments/create`, but the route that exists is `departments/createDepartment`. Internal
notes are mirrored as session comments and never sent to the customer.

### Distribution and client owners

*Ajustes -> Atendimento* turns on automatic distribution (off by default). A database trigger
assigns each customer message on an unassigned conversation to the client's owner, or else to
who has waited longest among those accepting conversations; a row lock makes simultaneous
messages take turns. The webhook processor then repeats the assignment on ChatPro. Client owners
are mirrored with `leads/updateOwner`, which cannot clear an owner. People are matched by e-mail.

Work hours are per team member, in Brasília time, and only affect who distribution picks: someone
off duty receives nothing new, except their own clients. With nobody on duty, a conversation stays
unassigned until the next customer message. ChatPro's docs have no route for its own schedules,
so this is not mirrored, and it does not block anyone's access.

### Team permissions

*Ajustes -> Atendimento* sets what members see: all conversations (default), those of their
departments, or only their own. Unassigned conversations stay visible so someone can pick them up.
It is enforced by RLS on conversations, messages, notes and contacts, so calling the API directly
shows the same; the webhook pipeline runs as the service role and is not affected. A member can
transfer a conversation away and then stops seeing it; that write goes through the server, since RLS
refuses a change that hides a row from whoever makes it. ChatPro access is not affected.

### Agenda

`/agenda` is the salon's week, shared by the team. In a conversation, dates and times in messages
("sábado às 9h", "12/11", "amanhã 15h") become links that open the booking form filled in. They
are read relative to when the message was sent, in Brasília time; the form is always reviewed
before saving. A trigger refuses two clients at once for the same person, with a lock so
simultaneous bookings cannot both pass. Nothing is sent to the client and nothing goes to ChatPro:
its docs have no agenda route. Appointments are cancelled rather than deleted.

### Service rating (NPS)

*Ajustes -> Respostas* turns it on, off by default. ChatPro's docs say its own rating only goes out
when a session is finished inside its chat, so finishing through the CRM asks by itself, at most once
every 30 days per client and within the automatic messages' hourly limit. A database trigger takes a
lone number from 0 to 10, on a finished conversation and within 24 hours, as the rating: it does not
reopen or distribute the conversation. Anything else is the customer writing again.

### Reports

`/reports` is for owners and admins: the database functions refuse anyone else. An attendance
follows ChatPro's rule, one per person every 24 hours, so this is the number to compare with a
plan's allowance. First response is a median and does not discount closed hours. Exports are
semicolon CSV with a byte order mark, which opens directly in Excel in Brazil. Cells are guarded
against spreadsheet formulas, and each export is audited.

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
