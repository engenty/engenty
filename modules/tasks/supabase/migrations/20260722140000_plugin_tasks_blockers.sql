-- Task dependency graph (agent coordination, Phase 1).
--
-- `blocked_by_task_ids` expresses "this task is blocked by those tasks" as a
-- first-class set. A task is dispatchable only when every blocker has reached
-- status 'done' (cancelled does NOT count as resolved — remove/replace it
-- explicitly). When the last blocker resolves, the dependent auto-wakes and
-- dispatches. Independent branches of the graph have no shared blockers, so
-- they dispatch concurrently — parallel fan-out falls out of the graph.
--
-- Column grants are inherited from the schema-wide grants in the base tasks
-- migration (grant ... on all tables in schema module_tasks), so ADD COLUMN
-- needs no extra grant.

alter table module_tasks.tasks
  add column if not exists blocked_by_task_ids uuid[] not null default '{}';

-- Reverse lookup "which tasks does X block" (dependents of a resolved task)
-- without a full scan: `where blocked_by_task_ids @> array[X]`.
create index if not exists idx_module_tasks_tasks_blocked_by
  on module_tasks.tasks using gin (blocked_by_task_ids);
