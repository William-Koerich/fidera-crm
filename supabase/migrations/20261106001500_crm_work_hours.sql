-- Work hours per team member. Null means no schedule: always available.
alter table crm.memberships add column work_hours jsonb;

-- Same format and rules as the automatic replies: { "1": { "open": "09:00", "close": "18:00" } },
-- by weekday (0 = Sunday), in Brasília time. A missing day is off.
create function crm_private.is_on_duty(p_hours jsonb, p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_hours is null then true
    else coalesce(
      (
        to_char(local.at, 'HH24:MI') >= p_hours -> extract(dow from local.at)::int::text ->> 'open'
        and to_char(local.at, 'HH24:MI') < p_hours -> extract(dow from local.at)::int::text ->> 'close'
      ),
      false
    )
  end
  from (select p_at at time zone 'America/Sao_Paulo' as at) local;
$$;

revoke all on function crm_private.is_on_duty(jsonb, timestamptz) from public, anon, authenticated;

create or replace function crm_private.auto_assign_on_customer_message()
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

  -- The client stays with their owner even outside the owner's hours.
  select ct.owner_id into v_assignee
  from crm.contacts ct
  join crm.memberships m on m.organization_id = ct.organization_id and m.user_id = ct.owner_id
  where ct.id = v_contact;

  if v_assignee is null then
    select m.user_id into v_assignee
    from crm.memberships m
    where m.organization_id = v_org and m.accepts_conversations and crm_private.is_on_duty(m.work_hours)
    order by m.last_assigned_at asc nulls first, m.created_at asc
    limit 1;
  end if;
  -- Nobody on duty: it stays unassigned and the next customer message tries again.
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
