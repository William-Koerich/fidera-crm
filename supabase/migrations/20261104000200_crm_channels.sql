-- Channel tables: accounts, contacts, identities, conversations, messages,
-- raw webhook events, usage ledger and audit log.
--
-- Cross-table references use composite FKs on (organization_id, id), so a
-- row can never point at a row from another organization, even via service_role.

create type crm.channel as enum ('whatsapp', 'instagram');
create type crm.channel_provider as enum ('mock', 'meta');
create type crm.channel_account_status as enum ('pending', 'active', 'disconnected', 'error');
create type crm.message_direction as enum ('inbound', 'outbound');
-- customer: sent by the contact; api: sent by us through the provider;
-- business_app_echo: sent by the owner from the WhatsApp Business app;
-- history: imported from history sync.
create type crm.message_origin as enum ('customer', 'api', 'business_app_echo', 'history');
create type crm.message_type as enum (
  'text', 'image', 'audio', 'video', 'document', 'sticker', 'location',
  'contacts', 'reaction', 'template', 'interactive', 'unsupported'
);
create type crm.message_status as enum (
  'received', 'pending', 'sent', 'delivered', 'read', 'failed', 'deleted'
);
create type crm.contact_source as enum (
  'whatsapp_inbound', 'instagram_inbound', 'business_app_echo', 'history',
  'capture_link', 'manual', 'import'
);
create type crm.webhook_event_status as enum ('pending', 'processing', 'processed', 'failed', 'skipped');

-- channel_accounts ----------------------------------------------------------
create table crm.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  channel crm.channel not null,
  provider crm.channel_provider not null,
  -- WhatsApp: phone_number_id. Instagram: IG professional account id.
  external_account_id text not null,
  -- WhatsApp Business Account id (WhatsApp only).
  external_business_id text,
  display_name text,
  display_phone text,
  status crm.channel_account_status not null default 'pending',
  -- Reference to vault.secrets; the token itself is never stored here.
  token_secret_id uuid,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  -- Webhooks are routed by this key, so it is globally unique.
  unique (provider, channel, external_account_id)
);

create trigger channel_accounts_updated_at
  before update on crm.channel_accounts
  for each row execute function crm_private.set_updated_at();

-- contacts --------------------------------------------------------------------
create table crm.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  display_name text,
  -- Canonical phone (E.164 digits, BR mobile with the 9th digit). Not a key.
  phone_normalized text,
  source crm.contact_source not null,
  source_detail text,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create index contacts_org_phone_idx on crm.contacts (organization_id, phone_normalized);

create trigger contacts_updated_at
  before update on crm.contacts
  for each row execute function crm_private.set_updated_at();

-- contact_identities ------------------------------------------------------------
create table crm.contact_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contact_id uuid not null,
  channel crm.channel not null,
  -- Original identifier exactly as the channel sends it (wa_id, IGSID...).
  external_id text not null,
  phone_normalized text,
  profile_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, contact_id)
    references crm.contacts (organization_id, id) on delete cascade,
  unique (organization_id, channel, external_id)
);

create index contact_identities_contact_idx on crm.contact_identities (contact_id);
create index contact_identities_org_phone_idx on crm.contact_identities (organization_id, phone_normalized);

create trigger contact_identities_updated_at
  before update on crm.contact_identities
  for each row execute function crm_private.set_updated_at();

-- conversations -------------------------------------------------------------------
create table crm.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contact_id uuid not null,
  channel_account_id uuid not null,
  channel crm.channel not null,
  assigned_to uuid references auth.users (id) on delete set null,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_at timestamptz,
  reply_window_ends_at timestamptz,
  awaiting_reply boolean not null default false,
  unread_count integer not null default 0 check (unread_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (channel_account_id, contact_id),
  foreign key (organization_id, contact_id)
    references crm.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, channel_account_id)
    references crm.channel_accounts (organization_id, id) on delete cascade
);

-- Inbox cursor pagination: (last_message_at, id) descending.
create index conversations_inbox_idx
  on crm.conversations (organization_id, last_message_at desc nulls last, id desc);
create index conversations_awaiting_idx
  on crm.conversations (organization_id, last_inbound_at) where awaiting_reply;
create index conversations_contact_idx on crm.conversations (contact_id);

create trigger conversations_updated_at
  before update on crm.conversations
  for each row execute function crm_private.set_updated_at();

-- messages --------------------------------------------------------------------------
create table crm.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  channel_account_id uuid not null,
  direction crm.message_direction not null,
  origin crm.message_origin not null,
  type crm.message_type not null,
  body text,
  -- Private storage path; clients get signed URLs.
  media_path text,
  media_mime_type text,
  media_external_id text,
  status crm.message_status not null,
  external_message_id text,
  error_code text,
  sent_by uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, conversation_id)
    references crm.conversations (organization_id, id) on delete cascade,
  foreign key (organization_id, channel_account_id)
    references crm.channel_accounts (organization_id, id) on delete cascade
);

create unique index messages_external_id_key
  on crm.messages (channel_account_id, external_message_id);
create index messages_conversation_idx
  on crm.messages (conversation_id, occurred_at desc, id desc);
create index messages_org_idx on crm.messages (organization_id);

create trigger messages_updated_at
  before update on crm.messages
  for each row execute function crm_private.set_updated_at();

-- webhook_events (raw, server-only) -------------------------------------------------
create table crm.webhook_events (
  id uuid primary key default gen_random_uuid(),
  -- Unknown until the event is routed to a channel account.
  organization_id uuid references crm.organizations (id) on delete cascade,
  channel_account_id uuid references crm.channel_accounts (id) on delete set null,
  provider crm.channel_provider not null,
  channel crm.channel not null,
  -- sha256 of the raw body: the same delivery is stored only once.
  dedupe_key text not null,
  payload jsonb not null,
  status crm.webhook_event_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, dedupe_key)
);

create index webhook_events_pending_idx
  on crm.webhook_events (next_attempt_at) where status in ('pending', 'failed');
create index webhook_events_org_idx on crm.webhook_events (organization_id);

-- usage_ledger -------------------------------------------------------------------------
create table crm.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  channel_account_id uuid references crm.channel_accounts (id) on delete set null,
  message_id uuid references crm.messages (id) on delete set null,
  -- e.g. service, utility, marketing, authentication
  category text not null,
  quantity integer not null default 1 check (quantity > 0),
  estimated_cost numeric(12, 4) not null default 0 check (estimated_cost >= 0),
  currency char(3) not null default 'BRL',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index usage_ledger_org_time_idx on crm.usage_ledger (organization_id, occurred_at desc);

-- audit_log ----------------------------------------------------------------------------
create table crm.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references crm.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  -- No message content, tokens or unnecessary personal data here.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_org_time_idx on crm.audit_log (organization_id, created_at desc);

-- RLS --------------------------------------------------------------------------------------
alter table crm.channel_accounts enable row level security;
alter table crm.contacts enable row level security;
alter table crm.contact_identities enable row level security;
alter table crm.conversations enable row level security;
alter table crm.messages enable row level security;
alter table crm.webhook_events enable row level security;
alter table crm.usage_ledger enable row level security;
alter table crm.audit_log enable row level security;

-- channel_accounts: members read, owners/admins manage.
create policy channel_accounts_select on crm.channel_accounts
  for select to authenticated using (crm_private.is_member(organization_id));
create policy channel_accounts_write on crm.channel_accounts
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));

-- Inbox data: members read and write, owners/admins delete.
do $$
declare
  t text;
begin
  foreach t in array array['contacts', 'contact_identities', 'conversations', 'messages'] loop
    execute format(
      'create policy %1$s_select on crm.%1$I for select to authenticated
         using (crm_private.is_member(organization_id))', t);
    execute format(
      'create policy %1$s_insert on crm.%1$I for insert to authenticated
         with check (crm_private.is_member(organization_id))', t);
    execute format(
      'create policy %1$s_update on crm.%1$I for update to authenticated
         using (crm_private.is_member(organization_id))
         with check (crm_private.is_member(organization_id))', t);
    execute format(
      'create policy %1$s_delete on crm.%1$I for delete to authenticated
         using (crm_private.has_role(organization_id, array[''owner'', ''admin'']::crm.membership_role[]))', t);
  end loop;
end;
$$;

-- usage_ledger and audit_log: owners/admins read; only the server writes.
create policy usage_ledger_select on crm.usage_ledger
  for select to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));
create policy audit_log_select on crm.audit_log
  for select to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));

-- webhook_events: no policies. Only service_role (server) accesses raw events.

-- Grants -----------------------------------------------------------------------------------
grant select, insert, update, delete on
  crm.channel_accounts, crm.contacts, crm.contact_identities, crm.conversations, crm.messages
  to authenticated;
grant select on crm.usage_ledger, crm.audit_log to authenticated;
revoke all on crm.webhook_events from authenticated, anon;
grant all on
  crm.channel_accounts, crm.contacts, crm.contact_identities, crm.conversations,
  crm.messages, crm.webhook_events, crm.usage_ledger, crm.audit_log
  to service_role;
