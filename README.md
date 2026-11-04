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
