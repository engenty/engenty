-- Memory entries: one row per fact an agent (or a person) chose to keep.
--
-- One store for everything agents remember, keyed by scope:
--   agent   — the agent's own notes; agent_id plus where it works: a personal
--             agent keys on its person (user_id), any other agent on the Space
--             it runs in (space_id), or on the company when it runs outside a
--             Space (neither set)
--   user    — facts about one person, for every agent that person talks to
--   space   — what everyone in one Space should know
--   company — what every Space should know
--
-- Replaces the MEMORY.md text on ai.mastra_resources.working_memory, the
-- `/space/KNOWLEDGE.md` convention, the Mastra working-memory profile and the
-- river chapters' `keep_in_mind` notes. Nothing is carried over.
--
-- ai.working_memory (below) is the other half: the current state of the same
-- keys as a few fixed fields, replaced when it changes.

create table ai.memory_entries (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants (id) on delete cascade,
  scope text not null,
  agent_id text,
  space_id uuid,
  user_id uuid,
  body text not null,
  created_by_user_id uuid,
  source_thread_id uuid references ai.thread (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_entries_scope_check
    check (scope in ('agent', 'user', 'space', 'company')),
  constraint memory_entries_body_check
    check (char_length(body) between 1 and 400),
  constraint memory_entries_key_check check (
    (scope = 'agent' and agent_id is not null
      and num_nonnulls(space_id, user_id) <= 1)
    or (scope = 'user' and user_id is not null
      and agent_id is null and space_id is null)
    or (scope = 'space' and space_id is not null
      and agent_id is null and user_id is null)
    or (scope = 'company'
      and agent_id is null and space_id is null and user_id is null)
  ),
  constraint memory_entries_space_fkey foreign key (space_id, tenant_id)
    references core.spaces (id, tenant_id) on delete cascade
);

comment on table ai.memory_entries is
  'One fact an agent or a person chose to keep, by scope: agent (its own notes), user (about one person), space, company. Rendered into every run that may see it.';
comment on column ai.memory_entries.scope is
  'agent | user | space | company — who the fact is for. See the key check for which of agent_id / space_id / user_id each needs.';
comment on column ai.memory_entries.created_by_user_id is
  'The person who said it or wrote it; null for an unattended run.';

create index memory_entries_space_idx
  on ai.memory_entries (tenant_id, scope, space_id);
create index memory_entries_user_idx
  on ai.memory_entries (tenant_id, scope, user_id);
create index memory_entries_agent_idx
  on ai.memory_entries (tenant_id, agent_id);

alter table ai.memory_entries enable row level security;

create policy srv_tenant_isolation on ai.memory_entries
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

grant select, insert, update, delete on ai.memory_entries to engenty_server;
grant select, insert, update, delete on ai.memory_entries to service_role;

-- Working memory: the current state of one key — a person, a Space, the
-- company or an agent in its audience — as the fixed fields of its scope
-- (packages/ai-core/src/memory/working-memory.ts). One row per key; a new
-- value replaces the old one.
create table ai.working_memory (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants (id) on delete cascade,
  scope text not null,
  agent_id text,
  space_id uuid,
  user_id uuid,
  state jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid,
  updated_at timestamptz not null default now(),
  constraint working_memory_scope_check
    check (scope in ('agent', 'user', 'space', 'company')),
  constraint working_memory_state_check
    check (jsonb_typeof(state) = 'object'),
  constraint working_memory_key_check check (
    (scope = 'agent' and agent_id is not null
      and num_nonnulls(space_id, user_id) <= 1)
    or (scope = 'user' and user_id is not null
      and agent_id is null and space_id is null)
    or (scope = 'space' and space_id is not null
      and agent_id is null and user_id is null)
    or (scope = 'company'
      and agent_id is null and space_id is null and user_id is null)
  ),
  constraint working_memory_key_unique unique nulls not distinct
    (tenant_id, scope, agent_id, space_id, user_id),
  constraint working_memory_space_fkey foreign key (space_id, tenant_id)
    references core.spaces (id, tenant_id) on delete cascade
);

comment on table ai.working_memory is
  'The current state of one memory key (agent | user | space | company) as the fixed fields of its scope. Replaced, not appended — dated facts are ai.memory_entries.';
comment on column ai.working_memory.updated_by_user_id is
  'The person whose conversation or edit set it last; null for an unattended run.';

alter table ai.working_memory enable row level security;

create policy srv_tenant_isolation on ai.working_memory
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

grant select, insert, update, delete on ai.working_memory to engenty_server;
grant select, insert, update, delete on ai.working_memory to service_role;

-- The river's chapters no longer keep notes of their own: what is worth
-- keeping after a stretch is written as memory entries when the chapter is cut.
alter table ai.thread_compaction drop column keep_in_mind;
