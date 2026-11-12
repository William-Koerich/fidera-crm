-- The greeting can be a voice note the business recorded, instead of text.
alter table crm.auto_reply_settings
  add column greeting_format text not null default 'text' check (greeting_format in ('text', 'audio')),
  -- Inside the organization's own folder of crm-media, already converted to a WhatsApp voice note.
  add column greeting_audio_path text check (greeting_audio_path is null or char_length(greeting_audio_path) <= 300);

-- "Enabled needs text" becomes "enabled needs what the chosen format sends".
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'crm.auto_reply_settings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%greeting_enabled%'
  loop
    execute format('alter table crm.auto_reply_settings drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table crm.auto_reply_settings add constraint auto_reply_settings_greeting_ready check (
  not greeting_enabled
  or (greeting_format = 'text' and char_length(greeting_text) > 0)
  or (greeting_format = 'audio' and greeting_audio_path is not null)
);
