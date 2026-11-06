-- Appointments in the salon's agenda. The client's name is kept on the row: it must remain
-- readable after a contact is removed, and to members who cannot see that contact's conversation.
create table crm.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_name text not null check (char_length(client_name) between 1 and 120),
  contact_id uuid,
  conversation_id uuid,
  staff_id uuid,
  service text check (char_length(service) <= 120),
  notes text check (char_length(notes) <= 1000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'no_show', 'cancelled')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '12 hours'),
  foreign key (organization_id) references crm.organizations (id) on delete cascade,
  foreign key (organization_id, contact_id) references crm.contacts (organization_id, id) on delete set null (contact_id),
  foreign key (organization_id, conversation_id) references crm.conversations (organization_id, id) on delete set null (conversation_id),
  foreign key (organization_id, staff_id) references crm.memberships (organization_id, user_id) on delete set null (staff_id)
);
create index appointments_org_start_idx on crm.appointments (organization_id, starts_at);
create index appointments_staff_start_idx on crm.appointments (staff_id, starts_at) where status = 'scheduled';
create index appointments_contact_start_idx on crm.appointments (contact_id, starts_at);

create trigger appointments_updated_at
  before update on crm.appointments
  for each row execute function crm_private.set_updated_at();

-- One person cannot have two clients at once. Security definer so the check sees every row,
-- and locked per person so two simultaneous bookings cannot both pass.
create function crm_private.check_appointment_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'scheduled' or new.staff_id is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':' || new.staff_id::text, 0));
  if exists (
    select 1 from crm.appointments a
    where a.organization_id = new.organization_id
      and a.staff_id = new.staff_id
      and a.status = 'scheduled'
      and a.id <> new.id
      and a.starts_at < new.ends_at
      and a.ends_at > new.starts_at
  ) then
    raise exception 'This person already has an appointment at that time' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;

create trigger appointments_no_overlap
  before insert or update of staff_id, starts_at, ends_at, status on crm.appointments
  for each row execute function crm_private.check_appointment_overlap();

alter table crm.appointments enable row level security;

-- The whole team works from the same agenda. Rows are cancelled, not deleted, so history stays.
create policy appointments_select on crm.appointments
  for select to authenticated using (crm_private.is_member(organization_id));
create policy appointments_insert on crm.appointments
  for insert to authenticated with check (crm_private.is_member(organization_id));
create policy appointments_update on crm.appointments
  for update to authenticated
  using (crm_private.is_member(organization_id))
  with check (crm_private.is_member(organization_id));

revoke delete on crm.appointments from authenticated;
grant all on crm.appointments to service_role;
