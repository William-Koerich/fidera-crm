-- Automatic replies: a greeting on first contact and a message outside business hours.
alter type crm.message_origin add value if not exists 'automation';

create table crm.auto_reply_settings (
  organization_id uuid primary key references crm.organizations (id) on delete cascade,
  greeting_enabled boolean not null default false,
  greeting_text text not null default '' check (char_length(greeting_text) <= 4096),
  away_enabled boolean not null default false,
  away_text text not null default '' check (char_length(away_text) <= 4096),
  -- { "1": { "open": "09:00", "close": "18:00" } }, by weekday (0 = Sunday). A missing day is closed.
  business_hours jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (not greeting_enabled or char_length(greeting_text) > 0),
  check (not away_enabled or char_length(away_text) > 0)
);

create trigger auto_reply_settings_updated_at
  before update on crm.auto_reply_settings
  for each row execute function crm_private.set_updated_at();

alter table crm.auto_reply_settings enable row level security;

create policy auto_reply_settings_manage on crm.auto_reply_settings
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));

grant select, insert, update, delete on crm.auto_reply_settings to authenticated;
grant all on crm.auto_reply_settings to service_role;

-- Claimed atomically before sending, so retries and parallel workers send once.
alter table crm.conversations
  add column greeted_at timestamptz,
  add column last_away_reply_at timestamptz;
