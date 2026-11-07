-- Website chat contacts record where they came from. Same function as before, generated from its
-- current definition, with only the contact source expression extended.
CREATE OR REPLACE FUNCTION crm.ingest_events(p_provider crm.channel_provider, p_events jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
      when 'customer' then (case v_channel when 'instagram' then 'instagram_inbound' when 'webchat' then 'webchat_inbound' else 'whatsapp_inbound' end)::crm.contact_source
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
$function$;
