-- Channel accounts route webhooks (external_account_id) and reference Vault
-- secrets (token_secret_id). Letting users write them would allow claiming
-- another business's phone_number_id or pointing at someone else's secret.
-- From now on only the server (service_role) inserts/updates them, after its
-- own role check. Members still read; owners/admins may delete.

revoke insert, update on crm.channel_accounts from authenticated;

drop policy channel_accounts_write on crm.channel_accounts;

create policy channel_accounts_delete on crm.channel_accounts
  for delete to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));
