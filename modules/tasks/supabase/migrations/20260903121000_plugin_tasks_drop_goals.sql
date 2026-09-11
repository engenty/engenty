-- Goals leave the tasks module. A task is a work item again — not a card
-- under a Coordinator grouping.
--
-- WHY: product Goals (Ziele) failed as the agent control plane. Agents take
-- over via Mastra thread objectives, not `module_tasks.goals`. Coordinator
-- handoff, heartbeat, and `goal_id` on agent-created tasks go with the table.
-- Project phases stay in `modules/projects`; they were never this table.
--
-- `core.agent_goal_grants` STAYS: that `goal_id` is a grant *subject*
-- (often a thread), not a row in `module_tasks.goals`.
--
-- Guarded like every module migration: the public mirror ships core without
-- the tasks module, and every statement is `if exists` so a partially-applied
-- database can re-run this safely.

do $$
begin
  if to_regclass('module_tasks.tasks') is null then
    return;
  end if;

  drop index if exists module_tasks.idx_module_tasks_tasks_goal;

  alter table module_tasks.tasks
    drop column if exists goal_id;

  if to_regclass('module_tasks.goals') is not null then
    drop policy if exists tasks_goals_read on module_tasks.goals;
    drop policy if exists tasks_goals_write on module_tasks.goals;
  end if;

  drop table if exists module_tasks.goals;
end
$$;
