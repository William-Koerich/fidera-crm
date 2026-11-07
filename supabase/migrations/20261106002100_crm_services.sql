-- What the salon offers, with how long each takes. Appointments keep the service name as text,
-- so changing this list never rewrites past appointments.
create table crm.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  duration_minutes integer not null check (duration_minutes between 5 and 720),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create trigger services_updated_at
  before update on crm.services
  for each row execute function crm_private.set_updated_at();

alter table crm.services enable row level security;

create policy services_select on crm.services
  for select to authenticated using (crm_private.is_member(organization_id));
create policy services_write on crm.services
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));

grant all on crm.services to service_role;
