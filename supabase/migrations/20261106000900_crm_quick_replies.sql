-- Saved texts the team inserts in the inbox by typing "/".
create table crm.quick_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  shortcut text not null check (shortcut ~ '^[a-z0-9-]{1,30}$'),
  body text not null check (char_length(body) between 1 and 4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, shortcut)
);

create trigger quick_replies_updated_at
  before update on crm.quick_replies
  for each row execute function crm_private.set_updated_at();

alter table crm.quick_replies enable row level security;

create policy quick_replies_select on crm.quick_replies
  for select to authenticated using (crm_private.is_member(organization_id));
create policy quick_replies_write on crm.quick_replies
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));

grant select, insert, update, delete on crm.quick_replies to authenticated;
grant all on crm.quick_replies to service_role;
