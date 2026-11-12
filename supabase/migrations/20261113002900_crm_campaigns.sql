-- Campaigns: an ad or post tells people to send a set message ("Quero saber do curso de unhas").
-- When it arrives, the contact gets the campaign's label and, optionally, its own reply.
create table crm.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  trigger_text text not null check (char_length(btrim(trigger_text)) between 3 and 1000),
  label_id uuid,
  reply_format text not null default 'none' check (reply_format in ('none', 'text', 'audio')),
  reply_text text not null default '' check (char_length(reply_text) <= 4096),
  reply_audio_path text check (reply_audio_path is null or char_length(reply_audio_path) <= 300),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (
    reply_format = 'none'
    or (reply_format = 'text' and char_length(reply_text) > 0)
    or (reply_format = 'audio' and reply_audio_path is not null)
  ),
  foreign key (organization_id, label_id) references crm.labels (organization_id, id) on delete set null (label_id)
);
create index campaigns_org_idx on crm.campaigns (organization_id) where enabled;

create trigger campaigns_updated_at
  before update on crm.campaigns
  for each row execute function crm_private.set_updated_at();

alter table crm.campaigns enable row level security;
create policy campaigns_manage on crm.campaigns
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));
revoke all on crm.campaigns from anon;
grant select, insert, update, delete on crm.campaigns to authenticated;
grant all on crm.campaigns to service_role;

-- Who came through each campaign. One row per contact: the reply goes once, the count is people.
create table crm.campaign_contacts (
  campaign_id uuid not null,
  organization_id uuid not null,
  contact_id uuid not null,
  conversation_id uuid,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  messages integer not null default 1 check (messages > 0),
  primary key (campaign_id, contact_id),
  foreign key (organization_id, campaign_id) references crm.campaigns (organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id) references crm.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, conversation_id) references crm.conversations (organization_id, id) on delete set null (conversation_id)
);
create index campaign_contacts_org_idx on crm.campaign_contacts (organization_id, first_at);

alter table crm.campaign_contacts enable row level security;
create policy campaign_contacts_read on crm.campaign_contacts
  for select to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));
revoke all on crm.campaign_contacts from anon, authenticated;
grant select on crm.campaign_contacts to authenticated;
grant all on crm.campaign_contacts to service_role;
