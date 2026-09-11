-- Triggers leave the tasks module; a task goes back to being a work item.
--
-- WHY: a routine is no longer a standing task. It is its own record in
-- `ai.routines`, owned by a mounted specialist, and it names the action it
-- runs plus the wake source that starts it. Firing a routine starts a RUN — it
-- does not materialize, re-dispatch or resurrect a task. A task may be the
-- optional SUBJECT of a run, and nothing more: it has no wake source
-- (`trigger_id`, `invocation_key`), no action body (`flow_graph_id`,
-- `flow_input`) and no routine declarations (`outcome`, `report_mode`).
--
-- This SUPERSEDES 20260823130000_plugin_tasks_routines_are_standing_tasks.sql,
-- which folded the retired task templates INTO the task row and made
-- "a routine IS its standing task" the model. Read in filename order the two
-- tell the whole story: templates collapsed into the task, then the routine
-- left the task behind entirely. Neither `module_tasks.triggers` nor the
-- standing-task columns have a reader left.
--
-- `module_tasks.task_runs` STAYS: it is the record of runs against a work item,
-- which is exactly what checkout and release still write when a task is the
-- subject of a run. A routine's own runs live in `ai.action_request`.
--
-- Guarded like every module migration: the public mirror ships core without
-- the tasks module, and every statement is `if exists` so a partially-applied
-- database can re-run this safely.

do $$
begin
  if to_regclass('module_tasks.tasks') is null then
    return;
  end if;

  -- 1. The standing-task columns on the task row. These go FIRST: `trigger_id`
  --    carries an FK to module_tasks.triggers, so the table cannot be dropped
  --    while the column still references it.
  drop index if exists module_tasks.idx_module_tasks_tasks_trigger;
  drop index if exists module_tasks.idx_module_tasks_trigger_invocation;
  -- The action-target index was renamed in 20260823213500; drop both names so
  -- a database at either revision converges.
  drop index if exists module_tasks.idx_module_tasks_tasks_action_graph;
  drop index if exists module_tasks.idx_module_tasks_tasks_flow_graph;

  -- The declaration constraints from 20260823160000 (routine outcome +
  -- report floor) — dropped before their columns so the order reads plainly.
  alter table module_tasks.tasks
    drop constraint if exists tasks_report_mode_check;
  alter table module_tasks.tasks
    drop constraint if exists tasks_outcome_check;

  alter table module_tasks.tasks
    drop column if exists trigger_id,
    drop column if exists invocation_key,
    drop column if exists outcome,
    drop column if exists report_mode,
    drop column if exists flow_graph_id,
    drop column if exists action_graph_id,
    drop column if exists flow_input;

  -- 2. The wake-source table itself. Its policies and indexes go with it
  --    (`drop table` takes them), but they are named here explicitly so a
  --    database that lost the table while keeping stragglers still converges.
  if to_regclass('module_tasks.triggers') is not null then
    drop policy if exists tasks_triggers_read on module_tasks.triggers;
    drop policy if exists tasks_triggers_write on module_tasks.triggers;
  end if;
  drop index if exists module_tasks.idx_module_tasks_triggers_module_key;
  drop index if exists module_tasks.idx_module_tasks_triggers_scope;
  drop index if exists module_tasks.idx_module_tasks_triggers_event_lookup;
  drop index if exists module_tasks.idx_module_tasks_triggers_space;
  drop table if exists module_tasks.triggers;

  -- 3. Grants minted against a trigger subject now point at nothing. Scope
  --    'trigger' has no writer left, so these rows are unreachable orphans.
  if to_regclass('core.approval_grants') is not null then
    delete from core.approval_grants where scope = 'trigger';
  end if;
end $$;
