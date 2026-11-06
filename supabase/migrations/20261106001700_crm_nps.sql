-- Service rating. ChatPro only sends its own when a session is finished inside its chat, so
-- finishing here asks by itself. Off by default: it is an automated message to customers.
create table crm.nps_settings (
  organization_id uuid primary key references crm.organizations (id) on delete cascade,
  enabled boolean not null default false,
  question text not null default '' check (char_length(question) <= 1000),
  thanks text not null default '' check (char_length(thanks) <= 1000),
  updated_at timestamptz not null default now(),
  check (not enabled or (char_length(question) > 0 and char_length(thanks) > 0))
);

create trigger nps_settings_updated_at
  before update on crm.nps_settings
  for each row execute function crm_private.set_updated_at();

create table crm.nps_surveys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  contact_id uuid not null,
  -- Who handled it when it finished: the conversation may change hands later.
  assigned_to uuid references auth.users (id) on delete set null,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  score integer check (score between 0 and 10),
  answered_at timestamptz,
  response_message_id uuid references crm.messages (id) on delete set null,
  thanks_pending boolean not null default false,
  foreign key (organization_id, conversation_id) references crm.conversations (organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id) references crm.contacts (organization_id, id) on delete cascade
);
create index nps_surveys_conversation_idx on crm.nps_surveys (conversation_id, sent_at desc);
create index nps_surveys_contact_idx on crm.nps_surveys (contact_id, sent_at desc);
create index nps_surveys_org_sent_idx on crm.nps_surveys (organization_id, sent_at);
create index nps_surveys_thanks_idx on crm.nps_surveys (organization_id) where thanks_pending;

alter table crm.nps_settings enable row level security;
alter table crm.nps_surveys enable row level security;

create policy nps_settings_manage on crm.nps_settings
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));

-- Ratings are about the team: managers read them, and only the server writes them.
create policy nps_surveys_select on crm.nps_surveys
  for select to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));

revoke insert, update, delete on crm.nps_surveys from authenticated;
grant all on crm.nps_settings, crm.nps_surveys to service_role;

-- The survey this message answers: just a number from 0 to 10, on a finished conversation,
-- within the time limit. Anything else is a customer writing again.
create function crm_private.nps_survey_answered_by(p_conversation uuid, p_body text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from crm.nps_surveys s
  join crm.conversations c on c.id = s.conversation_id
  where s.conversation_id = p_conversation
    and s.answered_at is null
    and s.expires_at > now()
    and c.status = 'closed'
    and p_body ~ '^\s*(10|[0-9])\s*$'
  order by s.sent_at desc
  limit 1;
$$;

revoke all on function crm_private.nps_survey_answered_by(uuid, text) from public, anon, authenticated;

create or replace function crm_private.reopen_on_customer_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_survey uuid := crm_private.nps_survey_answered_by(new.conversation_id, new.body);
begin
  if v_survey is not null then
    update crm.nps_surveys
    set score = trim(new.body)::integer,
        answered_at = new.occurred_at,
        response_message_id = new.id,
        thanks_pending = true
    where id = v_survey;
    return null;
  end if;

  update crm.conversations
  set status = 'open', closed_at = null, closed_by = null, ending_id = null
  where id = new.conversation_id and status = 'closed';
  return null;
end;
$$;

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
  -- A rating is not a new conversation to hand out.
  if crm_private.nps_survey_answered_by(new.conversation_id, new.body) is not null then
    return null;
  end if;

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

-- Runs as the caller, so RLS also applies.
create function crm.report_nps(p_org uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start timestamptz := p_from::timestamp at time zone 'America/Sao_Paulo';
  v_end timestamptz := (p_to + 1)::timestamp at time zone 'America/Sao_Paulo';
begin
  if not crm_private.has_role(p_org, array['owner', 'admin']::crm.membership_role[]) then
    raise exception 'Reports are for owners and admins' using errcode = 'insufficient_privilege';
  end if;
  if p_to - p_from + 1 not between 1 and 366 then
    raise exception 'Invalid period' using errcode = 'invalid_parameter_value';
  end if;

  return (
    select jsonb_build_object(
      'sent', count(*),
      'answered', count(s.score),
      'promoters', count(*) filter (where s.score >= 9),
      'passives', count(*) filter (where s.score between 7 and 8),
      'detractors', count(*) filter (where s.score <= 6),
      'by_assignee', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', t.assigned_to, 'answered', t.answered, 'promoters', t.promoters, 'detractors', t.detractors
        ) order by t.answered desc)
        from (
          select x.assigned_to,
                 count(*) as answered,
                 count(*) filter (where x.score >= 9) as promoters,
                 count(*) filter (where x.score <= 6) as detractors
          from crm.nps_surveys x
          where x.organization_id = p_org and x.sent_at >= v_start and x.sent_at < v_end and x.score is not null
          group by x.assigned_to
        ) t
      ), '[]'::jsonb)
    )
    from crm.nps_surveys s
    where s.organization_id = p_org and s.sent_at >= v_start and s.sent_at < v_end
  );
end;
$$;

revoke all on function crm.report_nps(uuid, date, date) from public, anon;
grant execute on function crm.report_nps(uuid, date, date) to authenticated;
