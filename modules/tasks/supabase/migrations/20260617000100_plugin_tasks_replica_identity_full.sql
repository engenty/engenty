-- Backfill REPLICA IDENTITY FULL for the already-published tasks realtime tables
-- so DELETE events (and the tenant_id filter in @engenty/live-cache) carry the
-- full row, not just the primary key. Without this, agent/other-tab deletes never
-- reach the live cache and the UI stays stale until reload.

alter table module_tasks.tasks replica identity full;
alter table module_tasks.task_comments replica identity full;
alter table module_tasks.task_runs replica identity full;
alter table module_tasks.task_activity replica identity full;
