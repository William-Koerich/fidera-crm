-- Webhook ingestion: queue functions, event ingestion, maintenance job.
-- All functions here are server-only (service_role); authenticated cannot call them.

alter table crm.channel_accounts
  add column history_sync_progress integer check (history_sync_progress between 0 and 100),
  add column disconnected_reason text;

-- Delivery status ordering: a late "delivered" never overrides "read".
create function crm_private.status_rank(s crm.message_status)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'received' then 0
    when 'pending' then 0
    when 'sent' then 1
    when 'failed' then 2
    when 'delivered' then 3
    when 'read' then 4
    when 'deleted' then 5
  end;
$$;

-- Finds or creates the contact behind a channel identity. Matches an
-- existing contact of the same organization by normalized phone, so the
-- same person reached with and without the 9th digit is one contact.
create function crm_private.resolve_contact(
  p_org uuid,
  p_channel crm.channel,
  p_contact jsonb,
  p_source crm.contact_source
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_external text := p_contact->>'externalId';
  v_phone text := nullif(p_contact->>'phoneNormalized', '');
  v_name text := nullif(p_contact->>'profileName', '');
  v_contact uuid;
begin
  if v_external is null then
    raise exception 'contact.externalId is required';
  end if;

  -- Serialize concurrent workers on the same identity.
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_channel::text || ':' || v_external, 0));

  select ci.contact_id into v_contact
  from crm.contact_identities ci
  where ci.organization_id = p_org and ci.channel = p_channel and ci.external_id = v_external;

  if v_contact is not null then
    update crm.contact_identities
    set profile_name = coalesce(v_name, profile_name),
        phone_normalized = coalesce(v_phone, phone_normalized)
    where organization_id = p_org and channel = p_channel and external_id = v_external
      and (profile_name is distinct from coalesce(v_name, profile_name)
           or phone_normalized is distinct from coalesce(v_phone, phone_normalized));
    update crm.contacts set display_name = v_name
    where id = v_contact and display_name is null and v_name is not null;
    return v_contact;
  end if;

  if v_phone is not null then
    select c.id into v_contact
    from crm.contacts c
    where c.organization_id = p_org and c.phone_normalized = v_phone
    order by c.created_at
    limit 1;
  end if;

  if v_contact is null then
    insert into crm.contacts (organization_id, display_name, phone_normalized, source)
    values (p_org, v_name, v_phone, p_source)
    returning id into v_contact;
  else
    update crm.contacts set display_name = v_name
    where id = v_contact and display_name is null and v_name is not null;
  end if;

  insert into crm.contact_identities (organization_id, contact_id, channel, external_id, phone_normalized, profile_name)
  values (p_org, v_contact, p_channel, v_external, v_phone, v_name);

  return v_contact;
end;
$$;

-- Applies normalized events (see src/lib/channels/types.ts) for one provider.
-- Idempotent: messages are unique per (channel_account_id, external_message_id).
create function crm.ingest_events(p_provider crm.channel_provider, p_events jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  ev jsonb;
  v_kind text;
  v_channel crm.channel;
  v_acc_id uuid;
  v_org uuid;
  v_contact uuid;
  v_conv uuid;
  v_msg uuid;
  v_at timestamptz;
  v_dir crm.message_direction;
  v_origin crm.message_origin;
  v_source crm.contact_source;
  v_rows integer;
  r record;
  n_inserted integer := 0;
  n_duplicates integer := 0;
  n_statuses integer := 0;
  n_skipped integer := 0;
  v_orgs uuid[] := '{}';
begin
  for ev in select value from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    v_kind := ev->>'kind';
    v_channel := (ev->>'channel')::crm.channel;

    if v_kind = 'account_update' then
      if ev->>'event' = 'PARTNER_REMOVED' then
        for r in
          update crm.channel_accounts
          set status = 'disconnected', disconnected_reason = coalesce(ev->>'reason', 'PARTNER_REMOVED')
          where provider = p_provider and channel = v_channel
            and external_business_id = ev->>'businessExternalId'
          returning id, organization_id
        loop
          insert into crm.audit_log (organization_id, action, target_table, target_id, metadata)
          values (r.organization_id, 'channel_account.partner_removed', 'channel_accounts', r.id,
                  jsonb_build_object('reason', ev->>'reason', 'initiated_by', ev->>'initiatedBy'));
          v_orgs := v_orgs || r.organization_id;
        end loop;
      end if;
      continue;
    end if;

    if v_kind not in ('message', 'status', 'contact_sync', 'history_progress') then
      n_skipped := n_skipped + 1;
      continue;
    end if;

    select ca.id, ca.organization_id into v_acc_id, v_org
    from crm.channel_accounts ca
    where ca.provider = p_provider and ca.channel = v_channel
      and ca.external_account_id = ev->>'accountExternalId';

    if v_acc_id is null then
      n_skipped := n_skipped + 1;
      continue;
    end if;
    v_orgs := v_orgs || v_org;

    if v_kind = 'history_progress' then
      update crm.channel_accounts
      set history_sync_progress = greatest(coalesce(history_sync_progress, 0), least(100, (ev->>'progress')::integer))
      where id = v_acc_id;
      continue;
    end if;

    if v_kind = 'status' then
      update crm.messages m
      set status = (ev->>'status')::crm.message_status,
          error_code = coalesce(ev->>'errorCode', m.error_code)
      where m.channel_account_id = v_acc_id
        and m.external_message_id = ev->>'externalMessageId'
        and crm_private.status_rank((ev->>'status')::crm.message_status) > crm_private.status_rank(m.status);
      get diagnostics v_rows = row_count;
      n_statuses := n_statuses + v_rows;
      continue;
    end if;

    if v_kind = 'contact_sync' then
      -- Removing a contact on the phone never deletes CRM history.
      if ev->>'action' = 'add' then
        perform crm_private.resolve_contact(v_org, v_channel, ev->'contact', 'import');
      end if;
      continue;
    end if;

    -- kind = 'message'
    v_at := (ev->>'occurredAt')::timestamptz;
    v_dir := (ev->>'direction')::crm.message_direction;
    v_origin := (ev->>'origin')::crm.message_origin;
    v_source := case v_origin
      when 'customer' then (case v_channel when 'instagram' then 'instagram_inbound' else 'whatsapp_inbound' end)::crm.contact_source
      when 'business_app_echo' then 'business_app_echo'::crm.contact_source
      else 'history'::crm.contact_source
    end;

    v_contact := crm_private.resolve_contact(v_org, v_channel, ev->'contact', v_source);

    insert into crm.conversations (organization_id, contact_id, channel_account_id, channel)
    values (v_org, v_contact, v_acc_id, v_channel)
    on conflict (channel_account_id, contact_id) do nothing;
    select c.id into v_conv from crm.conversations c
    where c.channel_account_id = v_acc_id and c.contact_id = v_contact;

    v_msg := null;
    insert into crm.messages (
      organization_id, conversation_id, channel_account_id, direction, origin, type, body,
      media_external_id, media_mime_type, status, external_message_id, occurred_at
    )
    values (
      v_org, v_conv, v_acc_id, v_dir, v_origin, (ev->>'type')::crm.message_type, ev->>'body',
      ev->>'mediaExternalId', ev->>'mediaMimeType',
      (case when v_dir = 'inbound' then 'received' else 'sent' end)::crm.message_status,
      ev->>'externalMessageId', v_at
    )
    on conflict (channel_account_id, external_message_id) do nothing
    returning id into v_msg;

    if v_msg is null then
      n_duplicates := n_duplicates + 1;
      continue;
    end if;
    n_inserted := n_inserted + 1;

    update crm.conversations c
    set last_message_at = greatest(c.last_message_at, v_at),
        last_inbound_at = case when v_dir = 'inbound' then greatest(c.last_inbound_at, v_at) else c.last_inbound_at end,
        last_outbound_at = case when v_dir = 'outbound' then greatest(c.last_outbound_at, v_at) else c.last_outbound_at end,
        unread_count = c.unread_count + case when v_origin = 'customer' then 1 else 0 end
    where c.id = v_conv;

    update crm.conversations c
    set reply_window_ends_at = c.last_inbound_at + interval '24 hours',
        awaiting_reply = c.last_inbound_at is not null
          and (c.last_outbound_at is null or c.last_inbound_at > c.last_outbound_at)
    where c.id = v_conv;

    update crm.contacts set last_interaction_at = greatest(last_interaction_at, v_at)
    where id = v_contact;
  end loop;

  return jsonb_build_object(
    'inserted', n_inserted,
    'duplicates', n_duplicates,
    'statuses', n_statuses,
    'skipped', n_skipped,
    'organization_ids', (select coalesce(jsonb_agg(distinct o), '[]'::jsonb) from unnest(v_orgs) o)
  );
end;
$$;

-- Queue: claims due events with a lease. An event stuck in "processing"
-- (worker died) becomes claimable again when its lease expires.
create function crm.claim_webhook_events(p_limit integer default 10, p_ids uuid[] default null)
returns setof crm.webhook_events
language sql
set search_path = ''
as $$
  update crm.webhook_events e
  set status = 'processing',
      attempts = e.attempts + 1,
      next_attempt_at = now() + interval '5 minutes'
  where e.id in (
    select q.id from crm.webhook_events q
    where q.status in ('pending', 'failed', 'processing')
      and q.next_attempt_at <= now()
      and q.attempts < 10
      and (p_ids is null or q.id = any (p_ids))
    order by q.received_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  returning e.*;
$$;

create function crm.complete_webhook_event(
  p_id uuid,
  p_error text default null,
  p_organization_id uuid default null
)
returns void
language sql
set search_path = ''
as $$
  update crm.webhook_events e
  set status = case when p_error is null then 'processed' else 'failed' end::crm.webhook_event_status,
      processed_at = case when p_error is null then now() else null end,
      last_error = left(p_error, 500),
      organization_id = coalesce(e.organization_id, p_organization_id),
      -- Exponential backoff: 1, 2, 4 ... minutes, capped at 1 hour.
      next_attempt_at = case
        when p_error is null then e.next_attempt_at
        else now() + least(interval '1 hour', interval '1 minute' * power(2, greatest(e.attempts - 1, 0)))
      end
  where e.id = p_id;
$$;

-- Maintenance (pg_cron, every minute): retention + kick the processor for
-- pending events. The app URL and secret live in Vault:
--   select vault.create_secret('https://your-app.vercel.app', 'crm_app_url');
--   select vault.create_secret('<CRON_SECRET>', 'crm_cron_secret');
create function crm_private.webhook_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  delete from crm.webhook_events
  where status in ('processed', 'skipped') and received_at < now() - interval '30 days';
  delete from crm.audit_log where created_at < now() - interval '1 year';

  if not exists (
    select 1 from crm.webhook_events
    where status in ('pending', 'failed', 'processing') and next_attempt_at <= now() and attempts < 10
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'crm_app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'crm_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/internal/webhooks/process',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function crm_private.webhook_maintenance() from public, anon, authenticated;
revoke all on function crm_private.resolve_contact(uuid, crm.channel, jsonb, crm.contact_source) from public, anon, authenticated;

revoke all on function crm.ingest_events(crm.channel_provider, jsonb) from public, anon, authenticated;
revoke all on function crm.claim_webhook_events(integer, uuid[]) from public, anon, authenticated;
revoke all on function crm.complete_webhook_event(uuid, text, uuid) from public, anon, authenticated;
grant execute on function crm.ingest_events(crm.channel_provider, jsonb) to service_role;
grant execute on function crm.claim_webhook_events(integer, uuid[]) to service_role;
grant execute on function crm.complete_webhook_event(uuid, text, uuid) to service_role;
grant execute on function crm_private.resolve_contact(uuid, crm.channel, jsonb, crm.contact_source) to service_role;
grant execute on function crm_private.status_rank(crm.message_status) to service_role, authenticated;

select cron.schedule('crm-webhook-maintenance', '* * * * *', 'select crm_private.webhook_maintenance()');
