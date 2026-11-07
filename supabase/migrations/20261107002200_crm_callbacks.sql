-- "Chamar hoje": clients whose service is due again. Visits are appointments marked done.
alter table crm.services
  add column return_after_days integer check (return_after_days between 1 and 365);

-- Consent: someone who asked not to be called back never appears in the list again.
alter table crm.contacts
  add column do_not_contact boolean not null default false;

-- One row per visit handled, so the same reminder never shows twice. A new visit is a new key.
create table crm.callbacks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contact_id uuid not null,
  service_id uuid not null,
  last_visit_at timestamptz not null,
  status text not null check (status in ('called', 'skipped')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (contact_id, service_id, last_visit_at),
  foreign key (organization_id, contact_id) references crm.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id) references crm.organizations (id) on delete cascade
);
alter table crm.callbacks
  add constraint callbacks_service_fk foreign key (service_id) references crm.services (id) on delete cascade;
create index callbacks_org_created_idx on crm.callbacks (organization_id, created_at);

alter table crm.callbacks enable row level security;

create policy callbacks_select on crm.callbacks
  for select to authenticated
  using (crm_private.is_member(organization_id) and exists (select 1 from crm.contacts c where c.id = contact_id));
create policy callbacks_insert on crm.callbacks
  for insert to authenticated
  with check (
    crm_private.is_member(organization_id)
    and created_by = auth.uid()
    and exists (select 1 from crm.contacts c where c.id = contact_id)
    and exists (select 1 from crm.services s where s.id = service_id and s.organization_id = callbacks.organization_id)
  );

revoke update, delete on crm.callbacks from authenticated;
grant all on crm.callbacks to service_role;

-- Who is due, as of a Brasília calendar day. Runs as the caller: a member sees only the
-- contacts the team permissions allow. A service matches a visit by name, ignoring case.
create function crm.list_callbacks(p_org uuid, p_today date)
returns table (
  contact_id uuid,
  contact_name text,
  phone text,
  conversation_id uuid,
  service_id uuid,
  service_name text,
  last_visit_at timestamptz,
  due_on date
)
language sql
stable
set search_path = ''
as $$
  with visits as (
    select a.contact_id, s.id as service_id, s.name as service_name, s.return_after_days, max(a.starts_at) as last_at
    from crm.appointments a
    join crm.services s
      on s.organization_id = a.organization_id and lower(s.name) = lower(trim(a.service))
    where a.organization_id = p_org
      and a.status = 'done'
      and a.contact_id is not null
      and s.return_after_days is not null
    group by a.contact_id, s.id, s.name, s.return_after_days
  )
  select
    v.contact_id,
    ct.display_name,
    ct.phone_normalized,
    (
      select c.id from crm.conversations c
      where c.contact_id = v.contact_id
      order by c.last_message_at desc nulls last
      limit 1
    ),
    v.service_id,
    v.service_name,
    v.last_at,
    (v.last_at at time zone 'America/Sao_Paulo')::date + v.return_after_days
  from visits v
  join crm.contacts ct on ct.id = v.contact_id
  where not ct.do_not_contact
    and (v.last_at at time zone 'America/Sao_Paulo')::date + v.return_after_days <= p_today
    and not exists (
      select 1 from crm.appointments f
      where f.contact_id = v.contact_id and f.status = 'scheduled' and f.starts_at > now()
    )
    and not exists (
      select 1 from crm.callbacks cb
      where cb.contact_id = v.contact_id and cb.service_id = v.service_id and cb.last_visit_at = v.last_at
    )
  order by 8, 2
  limit 200;
$$;

revoke all on function crm.list_callbacks(uuid, date) from public, anon;
grant execute on function crm.list_callbacks(uuid, date) to authenticated;
