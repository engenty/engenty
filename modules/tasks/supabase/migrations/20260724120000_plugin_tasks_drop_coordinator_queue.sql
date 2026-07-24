-- Drop the orphaned coordinator dispatch queue.
--
-- Created in 20260722160100_plugin_tasks_goal_owner.sql but abandoned before
-- use: goal handoffs ride agent_task_dispatch (see goal-handoff-service.ts).
-- Idempotent: fresh installs after this migration have nothing to drop.

do $$
begin
  perform pgmq.drop_queue('agent_coordinator_dispatch');
exception when others then
  -- queue absent (fresh installs after this migration) — nothing to drop
  null;
end $$;
