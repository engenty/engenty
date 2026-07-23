-- Durable run outcomes on task_runs.
-- Until now a run's outcome lived only in ai.agent_run, written by a
-- best-effort side write in apps/ai — if that write failed, run history showed
-- "in progress" forever. The release path now stamps the outcome onto the
-- module's own task_runs row, making the task's run history authoritative.
-- Column grants inherit from the schema-wide grants in the base migration.

alter table module_tasks.task_runs
  add column if not exists finished_at timestamptz,
  add column if not exists outcome text;
