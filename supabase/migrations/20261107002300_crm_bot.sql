-- Service bot: a numbered menu that answers, books or hands over to the team. Off by default.
create table crm.bot_settings (
  organization_id uuid primary key references crm.organizations (id) on delete cascade,
  enabled boolean not null default false,
  welcome text not null default '' check (char_length(welcome) <= 1000),
  handoff_text text not null default '' check (char_length(handoff_text) <= 1000),
  -- [{ label, action: reply | book | handoff, reply, departmentId }]
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  updated_at timestamptz not null default now(),
  check (not enabled or (char_length(welcome) > 0 and char_length(handoff_text) > 0 and jsonb_array_length(options) > 0))
);

create trigger bot_settings_updated_at
  before update on crm.bot_settings
  for each row execute function crm_private.set_updated_at();

alter table crm.bot_settings enable row level security;
create policy bot_settings_manage on crm.bot_settings
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));
grant all on crm.bot_settings to service_role;

-- Where each conversation is in the bot's flow. Only the server reads or writes it; `version`
-- makes two deliveries of the same conversation unable to both advance it.
create table crm.bot_sessions (
  conversation_id uuid primary key references crm.conversations (id) on delete cascade,
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  state jsonb not null,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table crm.bot_sessions enable row level security;
revoke all on crm.bot_sessions from authenticated, anon;
grant all on crm.bot_sessions to service_role;

-- Who the bot may book clients with.
alter table crm.memberships add column bookable boolean not null default true;
