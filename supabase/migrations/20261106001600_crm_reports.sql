-- Reports for owners and admins. Both functions run as the caller, so RLS also applies.
-- Days follow Brasília time.

-- An attendance follows ChatPro's rule: a person writing opens one that lasts 24 hours,
-- with as many messages as they like. Imported history counts: it is real volume.
-- First response: from the first unanswered customer message to the next message sent by a
-- person. Automatic replies do not count as an answer.
create function crm.report_summary(p_org uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start timestamptz := p_from::timestamp at time zone 'America/Sao_Paulo';
  v_end timestamptz := (p_to + 1)::timestamp at time zone 'America/Sao_Paulo';
  v_days integer := p_to - p_from + 1;
  v_attendances integer[];
  v_inbound integer[];
  v_outbound integer[];
  v_automatic integer := 0;
  v_response_seconds double precision[] := '{}';
  v_conversation uuid;
  v_window_end timestamptz;
  v_waiting_since timestamptz;
  v_index integer;
  r record;
begin
  if not crm_private.has_role(p_org, array['owner', 'admin']::crm.membership_role[]) then
    raise exception 'Reports are for owners and admins' using errcode = 'insufficient_privilege';
  end if;
  if v_days < 1 or v_days > 366 then
    raise exception 'Invalid period' using errcode = 'invalid_parameter_value';
  end if;

  v_attendances := array_fill(0, array[v_days]);
  v_inbound := array_fill(0, array[v_days]);
  v_outbound := array_fill(0, array[v_days]);

  for r in
    select m.conversation_id, m.occurred_at, m.direction, m.origin
    from crm.messages m
    where m.organization_id = p_org
      and m.occurred_at >= v_start and m.occurred_at < v_end
      and m.status <> 'failed' and m.status <> 'pending'
    order by m.conversation_id, m.occurred_at
  loop
    if v_conversation is distinct from r.conversation_id then
      v_conversation := r.conversation_id;
      v_window_end := null;
      v_waiting_since := null;
    end if;
    v_index := ((r.occurred_at at time zone 'America/Sao_Paulo')::date - p_from) + 1;

    if r.direction = 'inbound' then
      v_inbound[v_index] := v_inbound[v_index] + 1;
      if v_window_end is null or r.occurred_at >= v_window_end then
        v_attendances[v_index] := v_attendances[v_index] + 1;
        v_window_end := r.occurred_at + interval '24 hours';
      end if;
      v_waiting_since := coalesce(v_waiting_since, r.occurred_at);
    elsif r.origin = 'automation' then
      v_automatic := v_automatic + 1;
    else
      v_outbound[v_index] := v_outbound[v_index] + 1;
      if v_waiting_since is not null then
        v_response_seconds := v_response_seconds || extract(epoch from r.occurred_at - v_waiting_since)::double precision;
        v_waiting_since := null;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'by_day', (
      select jsonb_agg(jsonb_build_object(
        'day', p_from + (i - 1),
        'attendances', v_attendances[i],
        'inbound', v_inbound[i],
        'outbound', v_outbound[i]
      ) order by i)
      from generate_series(1, v_days) i
    ),
    'automatic', v_automatic,
    'responses', coalesce(array_length(v_response_seconds, 1), 0),
    'median_response_seconds', (
      select percentile_cont(0.5) within group (order by s) from unnest(v_response_seconds) s
    ),
    'new_contacts', (
      select count(*) from crm.contacts c
      where c.organization_id = p_org and c.created_at >= v_start and c.created_at < v_end
    ),
    'closed', (
      select count(*) from crm.conversations c
      where c.organization_id = p_org and c.status = 'closed' and c.closed_at >= v_start and c.closed_at < v_end
    ),
    'waiting_now', (
      select count(*) from crm.conversations c
      where c.organization_id = p_org and c.status = 'open' and c.awaiting_reply
    ),
    'by_assignee', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', t.assigned_to, 'conversations', t.n) order by t.n desc)
      from (
        select c.assigned_to, count(*) as n
        from crm.conversations c
        where c.organization_id = p_org and c.last_message_at >= v_start and c.last_message_at < v_end
        group by c.assigned_to
      ) t
    ), '[]'::jsonb),
    'by_ending', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.name, 'conversations', t.n) order by t.n desc)
      from (
        select coalesce(e.name, 'Sem motivo') as name, count(*) as n
        from crm.conversations c
        left join crm.ending_reasons e on e.id = c.ending_id
        where c.organization_id = p_org and c.status = 'closed' and c.closed_at >= v_start and c.closed_at < v_end
        group by 1
      ) t
    ), '[]'::jsonb),
    'by_department', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.name, 'conversations', t.n) order by t.n desc)
      from (
        select coalesce(d.name, 'Sem departamento') as name, count(*) as n
        from crm.conversations c
        left join crm.departments d on d.id = c.department_id
        where c.organization_id = p_org and c.last_message_at >= v_start and c.last_message_at < v_end
        group by 1
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- One row per conversation with activity in the period, for the spreadsheet export.
create function crm.report_conversations(p_org uuid, p_from date, p_to date, p_limit integer default 10000)
returns table (
  contact_name text,
  phone text,
  status text,
  assigned_to uuid,
  department text,
  ending text,
  labels text,
  first_message_at timestamptz,
  last_message_at timestamptz,
  received bigint,
  sent bigint
)
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

  return query
    select
      ct.display_name,
      ct.phone_normalized,
      c.status,
      c.assigned_to,
      d.name,
      e.name,
      (
        select string_agg(l.name, ', ' order by l.name)
        from crm.contact_labels cl
        join crm.labels l on l.id = cl.label_id
        where cl.contact_id = ct.id
      ),
      m.first_at,
      m.last_at,
      m.received,
      m.sent
    from (
      select
        x.conversation_id,
        min(x.occurred_at) as first_at,
        max(x.occurred_at) as last_at,
        count(*) filter (where x.direction = 'inbound') as received,
        count(*) filter (where x.direction = 'outbound' and x.status not in ('failed', 'pending')) as sent
      from crm.messages x
      where x.organization_id = p_org and x.occurred_at >= v_start and x.occurred_at < v_end
      group by x.conversation_id
    ) m
    join crm.conversations c on c.id = m.conversation_id
    join crm.contacts ct on ct.id = c.contact_id
    left join crm.departments d on d.id = c.department_id
    left join crm.ending_reasons e on e.id = c.ending_id
    order by m.last_at desc
    limit least(greatest(p_limit, 1), 10000);
end;
$$;

revoke all on function crm.report_summary(uuid, date, date) from public, anon;
revoke all on function crm.report_conversations(uuid, date, date, integer) from public, anon;
grant execute on function crm.report_summary(uuid, date, date) to authenticated;
grant execute on function crm.report_conversations(uuid, date, date, integer) to authenticated;
