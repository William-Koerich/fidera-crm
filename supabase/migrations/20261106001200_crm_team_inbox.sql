-- Team inbox: finishing conversations, departments, labels, internal notes and search.
-- external_id links a row to the channel provider's own record, when there is one.

create table crm.ending_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  external_id text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table crm.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  external_id text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table crm.labels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  external_id text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table crm.contact_labels (
  organization_id uuid not null,
  contact_id uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (contact_id, label_id),
  foreign key (organization_id, contact_id) references crm.contacts (organization_id, id) on delete cascade,
  foreign key (organization_id, label_id) references crm.labels (organization_id, id) on delete cascade
);
create index contact_labels_label_idx on crm.contact_labels (label_id);

create table crm.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  body text not null check (char_length(body) between 1 and 4096),
  created_at timestamptz not null default now(),
  foreign key (organization_id, conversation_id) references crm.conversations (organization_id, id) on delete cascade
);
create index conversation_notes_conversation_idx on crm.conversation_notes (conversation_id, created_at);

alter table crm.conversations
  add column status text not null default 'open' check (status in ('open', 'closed')),
  add column closed_at timestamptz,
  add column closed_by uuid references auth.users (id) on delete set null,
  add column ending_id uuid,
  add column department_id uuid,
  add foreign key (organization_id, ending_id)
    references crm.ending_reasons (organization_id, id) on delete set null (ending_id),
  add foreign key (organization_id, department_id)
    references crm.departments (organization_id, id) on delete set null (department_id);
create index conversations_org_status_idx on crm.conversations (organization_id, status, last_message_at desc);

-- A customer writing again reopens a finished conversation.
create function crm_private.reopen_on_customer_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update crm.conversations
  set status = 'open', closed_at = null, closed_by = null, ending_id = null
  where id = new.conversation_id and status = 'closed';
  return null;
end;
$$;

create trigger messages_reopen_conversation
  after insert on crm.messages
  for each row when (new.origin = 'customer')
  execute function crm_private.reopen_on_customer_message();

-- Conversations matching a name, phone or message text. Runs as the caller, so RLS applies.
create function crm.search_conversations(p_org uuid, p_query text, p_limit integer default 50)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  with term as (
    select '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
           regexp_replace(p_query, '\D', '', 'g') as digits
  )
  select c.id
  from crm.conversations c
  join crm.contacts ct on ct.id = c.contact_id
  cross join term
  where c.organization_id = p_org
    and length(trim(p_query)) >= 2
    and (
      ct.display_name ilike term.pattern
      or (length(term.digits) >= 3 and ct.phone_normalized like '%' || term.digits || '%')
      or exists (
        select 1 from crm.messages m
        where m.conversation_id = c.id and m.body ilike term.pattern
      )
    )
  order by c.last_message_at desc nulls last
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function crm.search_conversations(uuid, text, integer) from public, anon;
grant execute on function crm.search_conversations(uuid, text, integer) to authenticated, service_role;

-- RLS ------------------------------------------------------------------------------------
alter table crm.ending_reasons enable row level security;
alter table crm.departments enable row level security;
alter table crm.labels enable row level security;
alter table crm.contact_labels enable row level security;
alter table crm.conversation_notes enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['ending_reasons', 'departments', 'labels'] loop
    execute format(
      'create policy %1$s_select on crm.%1$I for select to authenticated
         using (crm_private.is_member(organization_id))', t);
    execute format(
      'create policy %1$s_write on crm.%1$I for all to authenticated
         using (crm_private.has_role(organization_id, array[''owner'', ''admin'']::crm.membership_role[]))
         with check (crm_private.has_role(organization_id, array[''owner'', ''admin'']::crm.membership_role[]))', t);
  end loop;
end;
$$;

create policy contact_labels_select on crm.contact_labels
  for select to authenticated using (crm_private.is_member(organization_id));
create policy contact_labels_insert on crm.contact_labels
  for insert to authenticated with check (crm_private.is_member(organization_id));
create policy contact_labels_delete on crm.contact_labels
  for delete to authenticated using (crm_private.is_member(organization_id));

-- Notes are a record: nobody edits them, and only the author or a manager removes one.
create policy conversation_notes_select on crm.conversation_notes
  for select to authenticated using (crm_private.is_member(organization_id));
create policy conversation_notes_insert on crm.conversation_notes
  for insert to authenticated
  with check (crm_private.is_member(organization_id) and author_id = auth.uid());
create policy conversation_notes_delete on crm.conversation_notes
  for delete to authenticated
  using (
    author_id = auth.uid()
    or crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[])
  );

grant select, insert, update, delete on crm.ending_reasons, crm.departments, crm.labels to authenticated;
grant select, insert, delete on crm.contact_labels, crm.conversation_notes to authenticated;
grant all on crm.ending_reasons, crm.departments, crm.labels, crm.contact_labels, crm.conversation_notes to service_role;

alter publication supabase_realtime add table crm.conversation_notes;
