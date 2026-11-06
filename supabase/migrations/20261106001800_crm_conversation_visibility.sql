-- Which conversations team members see. Owners and admins always see everything.
-- 'all' is the default and changes nothing; 'department' and 'own' are chosen in Ajustes.
create table crm.access_settings (
  organization_id uuid primary key references crm.organizations (id) on delete cascade,
  member_visibility text not null default 'all' check (member_visibility in ('all', 'department', 'own')),
  updated_at timestamptz not null default now()
);

create trigger access_settings_updated_at
  before update on crm.access_settings
  for each row execute function crm_private.set_updated_at();

create table crm.member_departments (
  organization_id uuid not null,
  user_id uuid not null,
  department_id uuid not null,
  primary key (user_id, department_id),
  foreign key (organization_id, user_id) references crm.memberships (organization_id, user_id) on delete cascade,
  foreign key (organization_id, department_id) references crm.departments (organization_id, id) on delete cascade
);
create index member_departments_department_idx on crm.member_departments (department_id);

alter table crm.access_settings enable row level security;
alter table crm.member_departments enable row level security;

create policy access_settings_select on crm.access_settings
  for select to authenticated using (crm_private.is_member(organization_id));
create policy access_settings_write on crm.access_settings
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));

create policy member_departments_select on crm.member_departments
  for select to authenticated using (crm_private.is_member(organization_id));
create policy member_departments_write on crm.member_departments
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));

grant all on crm.access_settings, crm.member_departments to service_role;

create function crm_private.sees_all_conversations(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select crm_private.is_member(p_org) and (
    crm_private.has_role(p_org, array['owner', 'admin']::crm.membership_role[])
    or coalesce((select s.member_visibility from crm.access_settings s where s.organization_id = p_org), 'all') = 'all'
  );
$$;

-- 'own': assigned to them, or not yet assigned to anyone, so someone can pick it up.
-- 'department': assigned to them, in one of their departments, or with no one and no department.
create function crm_private.can_see_conversation(p_org uuid, p_assigned uuid, p_department uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select crm_private.is_member(p_org) and (
    crm_private.sees_all_conversations(p_org)
    or p_assigned = auth.uid()
    or case (select s.member_visibility from crm.access_settings s where s.organization_id = p_org)
      when 'own' then p_assigned is null
      when 'department' then
        (p_assigned is null and p_department is null)
        or exists (
          select 1 from crm.member_departments d
          where d.organization_id = p_org and d.user_id = auth.uid() and d.department_id = p_department
        )
      else false
    end
  );
$$;

revoke all on function crm_private.sees_all_conversations(uuid) from public, anon;
revoke all on function crm_private.can_see_conversation(uuid, uuid, uuid) from public, anon;
grant execute on function crm_private.sees_all_conversations(uuid) to authenticated, service_role;
grant execute on function crm_private.can_see_conversation(uuid, uuid, uuid) to authenticated, service_role;

drop policy conversations_select on crm.conversations;
create policy conversations_select on crm.conversations
  for select to authenticated using (crm_private.can_see_conversation(organization_id, assigned_to, department_id));

-- The new row is only checked for membership: transferring away is allowed, even if it hides the conversation.
drop policy conversations_update on crm.conversations;
create policy conversations_update on crm.conversations
  for update to authenticated
  using (crm_private.can_see_conversation(organization_id, assigned_to, department_id))
  with check (crm_private.is_member(organization_id));

-- Everything inside a conversation follows the conversation. These subqueries run under its RLS.
drop policy messages_select on crm.messages;
create policy messages_select on crm.messages
  for select to authenticated
  using (crm_private.is_member(organization_id) and exists (select 1 from crm.conversations c where c.id = conversation_id));

drop policy messages_insert on crm.messages;
create policy messages_insert on crm.messages
  for insert to authenticated
  with check (crm_private.is_member(organization_id) and exists (select 1 from crm.conversations c where c.id = conversation_id));

drop policy messages_update on crm.messages;
create policy messages_update on crm.messages
  for update to authenticated
  using (crm_private.is_member(organization_id) and exists (select 1 from crm.conversations c where c.id = conversation_id))
  with check (crm_private.is_member(organization_id));

drop policy conversation_notes_select on crm.conversation_notes;
create policy conversation_notes_select on crm.conversation_notes
  for select to authenticated
  using (crm_private.is_member(organization_id) and exists (select 1 from crm.conversations c where c.id = conversation_id));

drop policy conversation_notes_insert on crm.conversation_notes;
create policy conversation_notes_insert on crm.conversation_notes
  for insert to authenticated
  with check (
    crm_private.is_member(organization_id)
    and author_id = auth.uid()
    and exists (select 1 from crm.conversations c where c.id = conversation_id)
  );

-- A contact is visible through a visible conversation.
drop policy contacts_select on crm.contacts;
create policy contacts_select on crm.contacts
  for select to authenticated
  using (
    crm_private.sees_all_conversations(organization_id)
    or (crm_private.is_member(organization_id) and exists (select 1 from crm.conversations c where c.contact_id = contacts.id))
  );

drop policy contacts_update on crm.contacts;
create policy contacts_update on crm.contacts
  for update to authenticated
  using (
    crm_private.sees_all_conversations(organization_id)
    or (crm_private.is_member(organization_id) and exists (select 1 from crm.conversations c where c.contact_id = contacts.id))
  )
  with check (crm_private.is_member(organization_id));

drop policy contact_identities_select on crm.contact_identities;
create policy contact_identities_select on crm.contact_identities
  for select to authenticated
  using (crm_private.is_member(organization_id) and exists (select 1 from crm.contacts c where c.id = contact_id));

drop policy contact_identities_update on crm.contact_identities;
create policy contact_identities_update on crm.contact_identities
  for update to authenticated
  using (crm_private.is_member(organization_id) and exists (select 1 from crm.contacts c where c.id = contact_id))
  with check (crm_private.is_member(organization_id));

drop policy contact_labels_select on crm.contact_labels;
create policy contact_labels_select on crm.contact_labels
  for select to authenticated
  using (crm_private.is_member(organization_id) and exists (select 1 from crm.contacts c where c.id = contact_id));

drop policy contact_labels_insert on crm.contact_labels;
create policy contact_labels_insert on crm.contact_labels
  for insert to authenticated
  with check (crm_private.is_member(organization_id) and exists (select 1 from crm.contacts c where c.id = contact_id));

drop policy contact_labels_delete on crm.contact_labels;
create policy contact_labels_delete on crm.contact_labels
  for delete to authenticated
  using (crm_private.is_member(organization_id) and exists (select 1 from crm.contacts c where c.id = contact_id));
