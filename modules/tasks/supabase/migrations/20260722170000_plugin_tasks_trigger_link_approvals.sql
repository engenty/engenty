-- Routine linkage + durable tool-approval allow-lists.
-- Tasks now record which trigger (routine) materialized them, and carry
-- per-task approval grants so a headless run can pass the tool-approval gate
-- after a human approves. Triggers carry a routine-wide grant list that can be
-- pre-configured or extended via "Allow for this routine".
-- Column grants inherit from the schema-wide grants in the base migration.

alter table module_tasks.tasks
  add column if not exists trigger_id uuid
    references module_tasks.triggers(id) on delete set null,
  add column if not exists approval_grants text[] not null default '{}',
  add column if not exists approval_grants_once text[] not null default '{}';

create index if not exists idx_module_tasks_tasks_trigger
  on module_tasks.tasks (tenant_id, trigger_id) where trigger_id is not null;

alter table module_tasks.triggers
  add column if not exists approval_grants text[] not null default '{}';
