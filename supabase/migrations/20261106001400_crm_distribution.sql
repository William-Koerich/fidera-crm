-- Automatic distribution of new conversations, and each client's owner (carteira).
alter table crm.memberships
  add column accepts_conversations boolean not null default true,
  add column last_assigned_at timestamptz;

alter table crm.contacts
  add column owner_id uuid references auth.users (id) on delete set null;

-- Set when the database assigns, so the server can repeat it on the channel's own system.
alter table crm.conversations
  add column assign_mirror_pending boolean not null default false;
create index conversations_assign_mirror_idx on crm.conversations (channel_account_id) where assign_mirror_pending;

create table crm.distribution_settings (
  organization_id uuid primary key references crm.organizations (id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger distribution_settings_updated_at
  before update on crm.distribution_settings
  for each row execute function crm_private.set_updated_at();

alter table crm.distribution_settings enable row level security;

create policy distribution_settings_select on crm.distribution_settings
  for select to authenticated using (crm_private.is_member(organization_id));
create policy distribution_settings_write on crm.distribution_settings
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));

grant all on crm.distribution_settings to service_role;

-- A customer message on an unassigned conversation goes to the client's owner, or else
-- to whoever has waited longest. Runs in the insert's transaction; the row lock on the
-- settings makes simultaneous messages take turns instead of picking the same person.
create function crm_private.auto_assign_on_customer_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_contact uuid;
  v_assigned uuid;
  v_assignee uuid;
begin
  select c.organization_id, c.contact_id, c.assigned_to into v_org, v_contact, v_assigned
  from crm.conversations c where c.id = new.conversation_id;
  if v_assigned is not null then
    return null;
  end if;

  perform 1 from crm.distribution_settings s
  where s.organization_id = v_org and s.enabled
  for update;
  if not found then
    return null;
  end if;

  -- The owner must still be on the team.
  select ct.owner_id into v_assignee
  from crm.contacts ct
  join crm.memberships m on m.organization_id = ct.organization_id and m.user_id = ct.owner_id
  where ct.id = v_contact;

  if v_assignee is null then
    select m.user_id into v_assignee
    from crm.memberships m
    where m.organization_id = v_org and m.accepts_conversations
    order by m.last_assigned_at asc nulls first, m.created_at asc
    limit 1;
  end if;
  if v_assignee is null then
    return null;
  end if;

  update crm.conversations
  set assigned_to = v_assignee, assign_mirror_pending = true
  where id = new.conversation_id and assigned_to is null;

  update crm.memberships
  set last_assigned_at = now()
  where organization_id = v_org and user_id = v_assignee;

  insert into crm.audit_log (organization_id, action, target_table, target_id, metadata)
  values (v_org, 'conversation.auto_assigned', 'conversations', new.conversation_id, jsonb_build_object('assigned_to', v_assignee));
  return null;
end;
$$;

create trigger messages_auto_assign
  after insert on crm.messages
  for each row when (new.origin = 'customer')
  execute function crm_private.auto_assign_on_customer_message();
