-- How each person is called in the agenda and by the AI ("Bia"), instead of their e-mail.
alter table crm.memberships
  add column display_name text check (display_name is null or char_length(display_name) between 1 and 60);

-- The team list now carries the name. The return type changes, so the function is recreated.
drop function crm.list_members(uuid);
create function crm.list_members(org_id uuid)
returns table (user_id uuid, email text, role crm.membership_role, created_at timestamptz, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.created_at, m.display_name
  from crm.memberships m
  join auth.users u on u.id = m.user_id
  where m.organization_id = org_id
    and crm_private.is_member(org_id)
  order by m.created_at;
$$;
revoke all on function crm.list_members(uuid) from public, anon;
grant execute on function crm.list_members(uuid) to authenticated;

-- Anyone may name themselves; owners and admins may name anyone in the business. Only the name
-- changes here, so the role rules of memberships_update stay untouched.
create function crm.set_member_name(org_id uuid, member_id uuid, new_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text := nullif(btrim(new_name), '');
begin
  if not (
    (member_id = (select auth.uid()) and crm_private.is_member(org_id))
    or crm_private.has_role(org_id, array['owner', 'admin']::crm.membership_role[])
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if cleaned is not null and char_length(cleaned) > 60 then
    raise exception 'Name too long' using errcode = '22001';
  end if;
  update crm.memberships set display_name = cleaned where organization_id = org_id and user_id = member_id;
  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function crm.set_member_name(uuid, uuid, text) from public, anon;
grant execute on function crm.set_member_name(uuid, uuid, text) to authenticated;
