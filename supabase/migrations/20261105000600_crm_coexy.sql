-- Coexy (official Cloud API proxy with coexistence) as a channel provider,
-- plus encrypted per-account tokens in Supabase Vault.

alter type crm.channel_provider add value if not exists 'coexy';

-- Provider-side channel id (Coexy channel id). external_account_id stays the
-- WhatsApp phone_number_id used to route webhooks; until the number connects
-- it holds a "pending:<provider_channel_id>" placeholder.
alter table crm.channel_accounts add column provider_channel_id text;
create unique index channel_accounts_provider_channel_idx
  on crm.channel_accounts (provider, provider_channel_id) where provider_channel_id is not null;

-- Stores/replaces the access token of a channel account in Vault and keeps
-- only the secret id on the row. Server-only.
create function crm.set_channel_token(p_account_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  select token_secret_id into v_secret from crm.channel_accounts where id = p_account_id;
  if not found then
    raise exception 'channel account not found' using errcode = 'P0002';
  end if;

  if v_secret is null then
    v_secret := vault.create_secret(p_token, 'crm_channel_token_' || p_account_id::text, 'Fidera CRM channel token');
    update crm.channel_accounts set token_secret_id = v_secret where id = p_account_id;
  else
    perform vault.update_secret(v_secret, p_token);
  end if;
end;
$$;

-- Returns the decrypted token for the account that owns a phone_number_id.
create function crm.get_channel_token(p_provider crm.channel_provider, p_external_account_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from crm.channel_accounts ca
  join vault.decrypted_secrets s on s.id = ca.token_secret_id
  where ca.provider = p_provider and ca.external_account_id = p_external_account_id;
$$;

-- Removing an account also removes its secret.
create function crm_private.delete_channel_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.token_secret_id is not null then
    delete from vault.secrets where id = old.token_secret_id;
  end if;
  return old;
end;
$$;

create trigger channel_accounts_delete_token
  after delete on crm.channel_accounts
  for each row execute function crm_private.delete_channel_token();

revoke all on function crm.set_channel_token(uuid, text) from public, anon, authenticated;
revoke all on function crm.get_channel_token(crm.channel_provider, text) from public, anon, authenticated;
grant execute on function crm.set_channel_token(uuid, text) to service_role;
grant execute on function crm.get_channel_token(crm.channel_provider, text) to service_role;

-- Users must not read or change the secret reference.
revoke update (token_secret_id) on crm.channel_accounts from authenticated;
