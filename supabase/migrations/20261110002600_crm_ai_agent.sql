-- The AI attendant: answers customers on its own, checks free times and books in the agenda.
-- The business writes its own instructions (the prompt); the fixed safety rules live in code.
create table crm.ai_agent_settings (
  organization_id uuid primary key references crm.organizations (id) on delete cascade,
  enabled boolean not null default false,
  instructions text not null default '' check (char_length(instructions) <= 6000),
  -- always: answers any time; outside_hours: only when the business is closed.
  mode text not null default 'always' check (mode in ('always', 'outside_hours')),
  can_book boolean not null default true,
  can_cancel boolean not null default true,
  -- After someone on the team writes in a conversation, the AI stays quiet there this long.
  pause_after_team_hours integer not null default 12 check (pause_after_team_hours between 1 and 72),
  handoff_department_id uuid,
  updated_at timestamptz not null default now(),
  check (not enabled or char_length(instructions) > 0),
  foreign key (organization_id, handoff_department_id)
    references crm.departments (organization_id, id) on delete set null (handoff_department_id)
);

create trigger ai_agent_settings_updated_at
  before update on crm.ai_agent_settings
  for each row execute function crm_private.set_updated_at();

alter table crm.ai_agent_settings enable row level security;
create policy ai_agent_settings_manage on crm.ai_agent_settings
  for all to authenticated
  using (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]))
  with check (crm_private.has_role(organization_id, array['owner', 'admin']::crm.membership_role[]));
revoke all on crm.ai_agent_settings from anon;
grant select, insert, update on crm.ai_agent_settings to authenticated;
grant all on crm.ai_agent_settings to service_role;

-- Per conversation: paused (handed to the team, or by hand) and a short lease so two deliveries
-- of the same conversation never answer at once. Only the server writes it.
create table crm.ai_conversation_state (
  conversation_id uuid primary key,
  organization_id uuid not null,
  paused_until timestamptz,
  running_until timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, conversation_id)
    references crm.conversations (organization_id, id) on delete cascade
);
create index ai_conversation_state_org_idx on crm.ai_conversation_state (organization_id);

alter table crm.ai_conversation_state enable row level security;
-- The team sees whether the AI is paused in a conversation it can see; changes go through the server.
create policy ai_conversation_state_read on crm.ai_conversation_state
  for select to authenticated
  using (exists (select 1 from crm.conversations c where c.id = conversation_id));
revoke all on crm.ai_conversation_state from anon, authenticated;
grant select on crm.ai_conversation_state to authenticated;
grant all on crm.ai_conversation_state to service_role;
