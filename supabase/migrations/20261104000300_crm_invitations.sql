-- Invitation acceptance and member listing.

-- Accepts an invitation by its raw token. The token is only ever stored as a
-- SHA-256 hash. The signed-in user's email must match the invitation email.
create function crm.accept_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  user_email text;
  inv crm.invitations%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into inv
  from crm.invitations i
  where i.token_hash = encode(sha256(convert_to(invite_token, 'UTF8')), 'hex')
  for update;

  if not found or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'Invitation is invalid or expired' using errcode = 'P0002';
  end if;

  select lower(u.email) into user_email from auth.users u where u.id = uid;
  if user_email is distinct from inv.email then
    raise exception 'Invitation belongs to another email' using errcode = '42501';
  end if;

  insert into crm.memberships (organization_id, user_id, role)
  values (inv.organization_id, uid, inv.role)
  on conflict (organization_id, user_id) do nothing;

  update crm.invitations
  set accepted_at = now(), accepted_by = uid
  where id = inv.id;

  insert into crm.audit_log (organization_id, actor_id, action, target_table, target_id)
  values (inv.organization_id, uid, 'invitation.accepted', 'invitations', inv.id);

  return inv.organization_id;
end;
$$;

revoke all on function crm.accept_invitation(text) from public, anon;
grant execute on function crm.accept_invitation(text) to authenticated;

-- Members of an organization with their email (auth.users is not readable
-- by authenticated). Only members of that organization get rows.
create function crm.list_members(org_id uuid)
returns table (user_id uuid, email text, role crm.membership_role, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from crm.memberships m
  join auth.users u on u.id = m.user_id
  where m.organization_id = org_id
    and crm_private.is_member(org_id)
  order by m.created_at;
$$;

revoke all on function crm.list_members(uuid) from public, anon;
grant execute on function crm.list_members(uuid) to authenticated;
