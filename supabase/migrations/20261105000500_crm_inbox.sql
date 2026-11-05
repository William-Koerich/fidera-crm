-- Inbox support: last message preview, Realtime and private media bucket.

alter table crm.conversations add column last_message_preview text;

create function crm_private.set_last_message_preview()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update crm.conversations c
  set last_message_preview = case
        when new.type = 'text' then left(new.body, 140)
        else '[' || new.type::text || ']' || coalesce(' ' || left(new.body, 120), '')
      end
  where c.id = new.conversation_id
    and new.occurred_at >= coalesce(c.last_message_at, '-infinity'::timestamptz);
  return null;
end;
$$;

create trigger messages_last_preview
  after insert on crm.messages
  for each row execute function crm_private.set_last_message_preview();

-- Realtime (postgres_changes honours RLS: users only receive their org's rows).
alter publication supabase_realtime add table crm.conversations, crm.messages;

-- Private media bucket. No storage policies: only the server (service_role)
-- reads/writes; clients get short-lived signed URLs after a membership check.
insert into storage.buckets (id, name, public)
values ('crm-media', 'crm-media', false)
on conflict (id) do nothing;
