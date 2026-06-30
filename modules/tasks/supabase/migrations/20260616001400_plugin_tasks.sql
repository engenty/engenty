-- Consolidated tasks baseline (pre-launch).

-- >>> from 20260522120000_plugin_tasks.sql
-- Squashed tasks baseline (pre-launch).

-- >>> from 20260522120000_plugin_tasks.sql
-- Tasks module: canonical goals and tasks for human/agent collaboration.

create schema if not exists module_tasks;

create table if not exists module_tasks.tenant_settings (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  identifier_prefix text not null default 'ENG',
  stale_after_days integer not null default 7,
  task_status_definitions jsonb not null default '[]'::jsonb,
  primary key (tenant_id, scope_id)
);

create table if not exists module_tasks.task_identifier_sequences (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  prefix text not null default 'ENG',
  last_value integer not null default 0,
  primary key (tenant_id, scope_id, prefix)
);

create table if not exists module_tasks.goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  title text not null,
  description text,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'achieved', 'cancelled')),
  parent_id uuid references module_tasks.goals(id) on delete set null,
  owner_user_id uuid references core.users(id) on delete set null,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_tasks_goals_scope
  on module_tasks.goals (tenant_id, scope_id, updated_at desc);

create table if not exists module_tasks.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  identifier text not null,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'medium'
    check (priority in ('critical', 'high', 'medium', 'low')),
  goal_id uuid references module_tasks.goals(id) on delete set null,
  parent_id uuid references module_tasks.tasks(id) on delete set null,
  primary_assignee_kind text not null default 'none'
    check (primary_assignee_kind in ('user', 'agent', 'none')),
  primary_assignee_user_id uuid references core.users(id) on delete set null,
  primary_assignee_agent_type_key text,
  created_by_user_id uuid references core.users(id) on delete set null,
  created_by_agent_type_key text,
  due_date date,
  request_depth integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  checkout_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, scope_id, identifier)
);

create index if not exists idx_module_tasks_tasks_scope
  on module_tasks.tasks (tenant_id, scope_id, updated_at desc);

create index if not exists idx_module_tasks_tasks_goal
  on module_tasks.tasks (goal_id) where goal_id is not null;

create table if not exists module_tasks.task_collaborators (
  task_id uuid not null references module_tasks.tasks(id) on delete cascade,
  user_id uuid not null references core.users(id) on delete cascade,
  primary key (task_id, user_id)
);

create table if not exists module_tasks.task_contexts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  task_id uuid not null references module_tasks.tasks(id) on delete cascade,
  context_type text not null,
  context_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (task_id, context_type, context_id)
);

create index if not exists idx_module_tasks_contexts_lookup
  on module_tasks.task_contexts (tenant_id, scope_id, context_type, context_id);

create table if not exists module_tasks.task_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  task_id uuid not null references module_tasks.tasks(id) on delete cascade,
  content text not null,
  created_by_user_id uuid references core.users(id) on delete set null,
  created_by_agent_type_key text,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_tasks_comments_task
  on module_tasks.task_comments (task_id, created_at desc);

grant usage on schema module_tasks to service_role;
grant select, insert, update, delete on all tables in schema module_tasks to service_role;

alter table module_tasks.tenant_settings enable row level security;
alter table module_tasks.task_identifier_sequences enable row level security;
alter table module_tasks.goals enable row level security;
alter table module_tasks.tasks enable row level security;
alter table module_tasks.task_collaborators enable row level security;
alter table module_tasks.task_contexts enable row level security;
alter table module_tasks.task_comments enable row level security;

create policy tasks_tenant_settings_read on module_tasks.tenant_settings
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_tenant_settings_write on module_tasks.tenant_settings
for all using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
) with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_identifier_sequences on module_tasks.task_identifier_sequences
for all using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
) with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_goals_read on module_tasks.goals
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_goals_write on module_tasks.goals
for all using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
) with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_tasks_read on module_tasks.tasks
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_tasks_write on module_tasks.tasks
for all using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
) with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_collaborators on module_tasks.task_collaborators
for all using (
  exists (
    select 1 from module_tasks.tasks t
    where t.id = task_id
      and t.tenant_id = core.current_tenant_id()
      and core.has_scope(t.scope_id)
  )
) with check (
  exists (
    select 1 from module_tasks.tasks t
    where t.id = task_id
      and t.tenant_id = core.current_tenant_id()
      and core.has_scope(t.scope_id)
  )
);

create policy tasks_contexts on module_tasks.task_contexts
for all using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
) with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_comments on module_tasks.task_comments
for all using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
) with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260522130000_plugin_tasks_checkout.sql
-- Phase 4: agent checkout, task runs, and activity log.

create table if not exists module_tasks.task_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  task_id uuid not null references module_tasks.tasks(id) on delete cascade,
  agent_session_run_id uuid not null references ai.agent_run(id) on delete cascade,
  role text not null check (role in ('checkout', 'work', 'review')),
  created_at timestamptz not null default now()
);

create index if not exists idx_module_tasks_task_runs_task
  on module_tasks.task_runs (task_id, created_at desc);

create table if not exists module_tasks.task_activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  task_id uuid not null references module_tasks.tasks(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references core.users(id) on delete set null,
  actor_agent_type_key text,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_tasks_task_activity_task
  on module_tasks.task_activity (task_id, created_at desc);

alter table module_tasks.tasks
  drop constraint if exists tasks_checkout_run_fk;

alter table module_tasks.tasks
  add constraint tasks_checkout_run_fk
  foreign key (checkout_run_id) references ai.agent_run(id) on delete set null;

grant select, insert, update, delete on module_tasks.task_runs to service_role;
grant select, insert, update, delete on module_tasks.task_activity to service_role;

alter table module_tasks.task_runs enable row level security;
alter table module_tasks.task_activity enable row level security;

create policy tasks_task_runs on module_tasks.task_runs
for all using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
) with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_task_activity on module_tasks.task_activity
for all using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
) with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

-- >>> from 20260524120200_plugin_tasks_realtime.sql
-- Realtime: authenticated SELECT + publication for task live cache signals.

grant usage on schema module_tasks to authenticated;

grant select on table module_tasks.tasks to authenticated;
grant select on table module_tasks.task_comments to authenticated;
grant select on table module_tasks.task_runs to authenticated;
grant select on table module_tasks.task_activity to authenticated;

do $$
begin
  alter publication supabase_realtime add table module_tasks.tasks;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_tasks.task_comments;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_tasks.task_runs;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table module_tasks.task_activity;
exception
  when duplicate_object then null;
end $$;

-- >>> from 20260608163800_plugin_tasks_goals_owner_agent_and_level.sql
-- Add owner_agent_id and level columns to module_tasks.goals
alter table module_tasks.goals
  add column if not exists owner_agent_id uuid references ai.engenty_ai_agents(id) on delete set null,
  add column if not exists level text not null default 'task';

-- >>> from 20260609064500_plugin_tasks_project_id.sql
-- Add optional project_id to tasks for cross-module project linkage.
-- No FK constraint: the projects module may not be active.
ALTER TABLE module_tasks.tasks ADD COLUMN IF NOT EXISTS project_id uuid DEFAULT NULL;

-- Index for querying tasks by project
CREATE INDEX IF NOT EXISTS idx_module_tasks_tasks_project
  ON module_tasks.tasks (project_id) WHERE project_id IS NOT NULL;

-- >>> from 20260609073800_plugin_tasks_goals_project_id.sql
-- Add optional project_id to goals for cross-module project linkage.
-- No FK constraint: the projects module may not be active.
ALTER TABLE module_tasks.goals ADD COLUMN IF NOT EXISTS project_id uuid DEFAULT NULL;

-- Index for querying goals by project
CREATE INDEX IF NOT EXISTS idx_module_tasks_goals_project
  ON module_tasks.goals (project_id) WHERE project_id IS NOT NULL;

-- >>> from 20260609074800_plugin_tasks_drop_checkout_fk.sql
-- Drop the rigid FK from tasks.checkout_run_id → ai.agent_run.
-- The checkout_run_id is a correlation identifier that may originate from
-- coordinator sessions, external orchestrators, or manual triggers that don't
-- necessarily have an ai.agent_run row. Keeping a soft reference (UUID) is
-- sufficient; the FK was causing checkout failures.
ALTER TABLE module_tasks.tasks
  DROP CONSTRAINT IF EXISTS tasks_checkout_run_fk;

-- Also drop the legacy FK for task_runs.agent_session_run_id to ai.agent_run
-- — same issue: coordinator-initiated runs may not have an agent_run row.
ALTER TABLE module_tasks.task_runs
  DROP CONSTRAINT IF EXISTS task_runs_agent_session_run_id_fkey;

-- >>> from 20260611220000_plugin_tasks_agent_id_rename.sql
-- Phase 5.3: agent id rename to <module>.<role> dot notation.
-- Update task assignee references to the renamed agent ids.

UPDATE module_tasks.tasks
SET primary_assignee_agent_type_key = 'leads.manager'
WHERE primary_assignee_agent_type_key = 'leads_manager';

UPDATE module_tasks.tasks
SET primary_assignee_agent_type_key = 'company-profile.manager'
WHERE primary_assignee_agent_type_key = 'company_profile_manager';
