-- Multi-tenant base: organizations, memberships, invitations and RLS.
-- Everything lives in the `crm` schema (exposed to the Data API) and
-- `crm_private` (helpers, never exposed), because this Supabase project
-- is shared with other apps.

create schema if not exists crm;
create schema if not exists crm_private;

revoke all on schema crm from public, anon;
-- crm_private is never exposed to the Data API. authenticated only needs
-- usage + execute on the helpers that RLS policies call.
revoke all on schema crm_private from public, anon;
revoke all on all tables in schema crm_private from public, anon, authenticated;
grant usage on schema crm to authenticated, service_role;
grant usage on schema crm_private to service_role;

-- New objects in crm: no anon access, authenticated goes through RLS.
alter default privileges in schema crm revoke all on tables from public, anon;
alter default privileges in schema crm revoke execute on functions from public, anon;
alter default privileges in schema crm grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema crm grant all on tables to service_role;
alter default privileges in schema crm grant execute on functions to authenticated, service_role;

create type crm.membership_role as enum ('owner', 'admin', 'member');

-- updated_at helper ---------------------------------------------------------
create function crm_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- organizations ---------------------------------------------------------------
create table crm.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  timezone text not null default 'America/Sao_Paulo',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_updated_at
  before update on crm.organizations
  for each row execute function crm_private.set_updated_at();

-- memberships -----------------------------------------------------------------
create table crm.memberships (
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role crm.membership_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index memberships_user_id_idx on crm.memberships (user_id);

-- invitations -----------------------------------------------------------------
create table crm.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references crm.organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role crm.membership_role not null default 'member' check (role <> 'owner'),
  -- Only the SHA-256 of the invite token is stored.
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index invitations_organization_id_idx on crm.invitations (organization_id);
create unique index invitations_pending_email_idx
  on crm.invitations (organization_id, email) where accepted_at is null;

-- Helpers (security definer to avoid RLS recursion on memberships) -----------
create function crm_private.is_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from crm.memberships m
    where m.organization_id = org_id and m.user_id = (select auth.uid())
  );
$$;

create function crm_private.has_role(org_id uuid, roles crm.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from crm.memberships m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  );
$$;

revoke all on function crm_private.is_member(uuid) from public;
revoke all on function crm_private.has_role(uuid, crm.membership_role[]) from public;
grant usage on schema crm_private to authenticated;
grant execute on function crm_private.is_member(uuid) to authenticated, service_role;
grant execute on function crm_private.has_role(uuid, crm.membership_role[]) to authenticated, service_role;

-- Every organization keeps at least one owner. ------------------------------
create function crm_private.ensure_owner_remains()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     -- Not when the organization itself or the auth user is being deleted.
     and exists (select 1 from crm.organizations o where o.id = old.organization_id)
     and exists (select 1 from auth.users u where u.id = old.user_id)
     and not exists (
       select 1 from crm.memberships m
       where m.organization_id = old.organization_id
         and m.role = 'owner'
         and m.user_id <> old.user_id
     )
  then
    raise exception 'An organization must keep at least one owner'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_keep_owner
  before update or delete on crm.memberships
  for each row execute function crm_private.ensure_owner_remains();

-- Creating an organization: atomically adds the caller as owner. -------------
create function crm.create_organization(org_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  org_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into crm.organizations (name, created_by)
  values (btrim(org_name), uid)
  returning id into org_id;

  insert into crm.memberships (organization_id, user_id, role)
  values (org_id, uid, 'owner');

  return org_id;
end;
$$;

revoke all on function crm.create_organization(text) from public, anon;
grant execute on function crm.create_organization(text) to authenticated;

-- RLS -------------------------------------------------------------------------
alter table crm.organizations enable row level security;
alter table crm.memberships enable row level security;
alter table crm.invitations enable row level security;

-- organizations: created only via crm.create_organization.
create policy organizations_select on crm.organizations
  for select to authenticated
  using (crm_private.is_member(id));

create policy organizations_update on crm.organizations
  for update to authenticated
  using (crm_private.has_role(id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(id, array['owner', 'admin']::crm.membership_role[]));

create policy organizations_delete on crm.organizations
  for delete to authenticated
  using (crm_private.has_role(id, array['owner']::crm.membership_role[]));

-- memberships: members see each other; owners/admins manage;
-- only owners grant or change the owner role; anyone can leave.
create policy memberships_select on crm.memberships
  for select to authenticated
  using (crm_private.is_member(organization_id));

create policy memberships_insert on crm.memberships
  for insert to authenticated
  with check (
    crm_private.has_role(organization_id, array['owner']::crm.membership_role[])
    or (
      role <> 'owner'
      and crm_private.has_role(organization_id, array['admin']::crm.membership_role[])
    )
  );

create policy memberships_update on crm.memberships
  for update to authenticated
  using (
    crm_private.has_role(organization_id, array['owner']::crm.membership_role[])
    or (
      role <> 'owner'
      and crm_private.has_role(organization_id, array['admin']::crm.membership_role[])
    )
  )
  with check (
    crm_private.has_role(organization_id, array['owner']::crm.membership_role[])
    or (
      role <> 'owner'
      and crm_private.has_role(organization_id, array['admin']::crm.membership_role[])
    )
  );

create policy memberships_delete on crm.memberships
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or crm_private.has_role(organization_id, array['owner']::crm.membership_role[])
    or (
      role <> 'owner'
      and crm_private.has_role(organization_id, array['admin']::crm.membership_role[])
    )
  );

-- invitations: owners/admins only.
create policy invitations_all on crm.invitations
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));

-- Explicit grants (default privileges only cover objects created afterwards
-- by the same role, so be explicit here too).
grant select, insert, update, delete on crm.organizations, crm.memberships, crm.invitations to authenticated;
grant all on crm.organizations, crm.memberships, crm.invitations to service_role;
