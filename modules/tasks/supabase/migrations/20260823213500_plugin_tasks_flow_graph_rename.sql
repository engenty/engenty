-- tasks.action_graph_id -> tasks.flow_graph_id (ring 1 of the flow_graph
-- rename — see apps/core 20260823213000_ai_flow_graph_rename.sql for the why).
--
-- The column stays a soft reference: `ai.flow_graph` lives in another schema
-- owned by apps/ai, and modules must not take a hard FK on it (unchanged from
-- when the column was added). The module's API keeps the `action_graph_id`
-- field name until the identifier ring lands; the DAL maps at its boundary.
--
-- Guarded like every module migration: the public mirror ships core without
-- the tasks module, and a re-run must pass through untouched.

do $$
begin
  if to_regclass('module_tasks.tasks') is null then
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'module_tasks'
      and table_name = 'tasks'
      and column_name = 'action_graph_id'
  ) then
    return;
  end if;

  alter table module_tasks.tasks rename column action_graph_id to flow_graph_id;
  alter index if exists module_tasks.idx_module_tasks_tasks_action_graph
    rename to idx_module_tasks_tasks_flow_graph;

  comment on column module_tasks.tasks.flow_graph_id is
    'Published ai.flow_graph this task runs instead of an agent (Variant D). Mutually exclusive with a specialist assignee; soft reference across schemas by design.';
end $$;
