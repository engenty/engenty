-- Tasks module: triggers + task templates.
--
-- A Trigger is the single model for "a reason work starts" — a schedule, an
-- external event, or a manual fire. Every trigger references a Task template;
-- firing a trigger materializes a Task from that template into the normal
-- task pipeline. There are no prompt-only routines.
--
-- Schedule triggers are executed by Mastra heartbeats (schedule rows in the
-- ai schema); `heartbeat_id` links the trigger to its heartbeat. This replaces
-- ai.routine_state / ai.custom_routine and the pg_cron routines tick (dropped
-- in the core cutover migration).

create table if not exists module_tasks.task_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  name text not null,
  -- Task fields stamped onto every materialized task.
  title text not null,
  description text,
  agent_type_key text not null,
  priority text not null default 'medium'
    check (priority in ('critical', 'high', 'medium', 'low')),
  created_by_user_id uuid references core.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_module_tasks_task_templates_scope
  on module_tasks.task_templates (tenant_id, scope_id, updated_at desc);

create table if not exists module_tasks.triggers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  scope_id text not null,
  name text not null,
  description text,
  kind text not null check (kind in ('schedule', 'event', 'manual')),
  task_template_id uuid not null
    references module_tasks.task_templates(id) on delete cascade,
  enabled boolean not null default true,
  -- kind = 'schedule'
  cron text,
  timezone text,
  quiet_hours text,
  -- kind = 'event' (signal providers; wired in a later phase)
  provider_id text,
  resource text,
  event_filter jsonb,
  -- Module-declared triggers (ROUTINE.md sync) upsert deterministically on
  -- (tenant, module, key); user-created triggers are 'custom'.
  source text not null default 'custom' check (source in ('module', 'custom')),
  module_id text,
  module_key text,
  -- Runtime bookkeeping, written by the scheduler hook.
  heartbeat_id text,
  last_fired_at timestamptz,
  last_result text,
  created_by_user_id uuid references core.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint triggers_schedule_requires_cron
    check (kind <> 'schedule' or cron is not null)
);

create unique index if not exists idx_module_tasks_triggers_module_key
  on module_tasks.triggers (tenant_id, module_id, module_key)
  where module_id is not null;

create index if not exists idx_module_tasks_triggers_scope
  on module_tasks.triggers (tenant_id, scope_id, updated_at desc);

alter table module_tasks.task_templates enable row level security;
alter table module_tasks.triggers enable row level security;

create policy tasks_task_templates_read on module_tasks.task_templates
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_task_templates_write on module_tasks.task_templates
for all using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
) with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_triggers_read on module_tasks.triggers
for select using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

create policy tasks_triggers_write on module_tasks.triggers
for all using (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
) with check (
  tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
);

grant select, insert, update, delete on module_tasks.task_templates to service_role;
grant select, insert, update, delete on module_tasks.triggers to service_role;
grant select on table module_tasks.task_templates to authenticated;
grant select on table module_tasks.triggers to authenticated;

comment on table module_tasks.task_templates is
  'Reusable task blueprints; triggers materialize Tasks from these.';
comment on table module_tasks.triggers is
  'Reasons work starts (schedule | event | manual) — always via a task template. Schedule triggers are backed by Mastra heartbeats (heartbeat_id).';
