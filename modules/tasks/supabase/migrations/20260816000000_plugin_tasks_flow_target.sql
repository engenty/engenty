-- Variant D (PLAN-workflow-designer.md Phase 6, D1): a task template may target
-- a FLOW instead of an agent, and the materialized task carries that target.
--
-- The taxonomy this implements: a trigger never runs a flow itself — it
-- materializes a Task, and the Task is the control plane that runs the flow.
-- That keeps the June invariant ("Routine = Trigger(schedule) -> Task, always")
-- intact while giving deterministic work a schedule without an agent turn.
--
-- Both columns are nullable and unconstrained-by-FK across schemas on purpose:
-- `ai.action_graph` lives in another schema owned by apps/ai, and modules must
-- not take cross-schema foreign keys (the module could be installed without the
-- ai schema present). Referential integrity is enforced at fire time, which
-- also re-checks that the flow is still published — a check an FK could not do.

-- ── task_templates: what a trigger will materialize ────────────────────────
alter table module_tasks.task_templates
  add column if not exists action_graph_id uuid,
  -- Static input handed to the flow on every fire. Subject binding still comes
  -- from the task's contexts; this is for flows whose input schema wants
  -- constants the template author chose (e.g. a lookback window).
  add column if not exists flow_input jsonb not null default '{}'::jsonb;

-- An agent template needs an agent; a flow template needs a flow. Existing rows
-- all have agent_type_key, so the relaxation below is safe to apply in place.
alter table module_tasks.task_templates
  alter column agent_type_key drop not null;

alter table module_tasks.task_templates
  drop constraint if exists task_templates_target_check;

alter table module_tasks.task_templates
  add constraint task_templates_target_check check (
    (agent_type_key is not null and action_graph_id is null)
    or (agent_type_key is null and action_graph_id is not null)
  );

-- ── tasks: the target stamped at materialization ───────────────────────────
-- Stamped from the template by fireTrigger rather than resolved through
-- trigger -> template at dispatch: the task must stay runnable (and auditable)
-- after its template is edited or deleted, exactly as title/description already
-- are copied rather than referenced.
alter table module_tasks.tasks
  add column if not exists action_graph_id uuid,
  add column if not exists flow_input jsonb not null default '{}'::jsonb;

-- Partial: only flow tasks are looked up this way (dispatch + the runs lane).
create index if not exists idx_module_tasks_tasks_action_graph
  on module_tasks.tasks (tenant_id, action_graph_id)
  where action_graph_id is not null;

comment on column module_tasks.task_templates.action_graph_id is
  'Published ai.action_graph this template runs instead of an agent (Variant D). Mutually exclusive with agent_type_key.';
comment on column module_tasks.task_templates.flow_input is
  'Static input merged into the flow run input on every fire.';
comment on column module_tasks.tasks.action_graph_id is
  'Flow this task runs, stamped from its template at materialization.';
comment on column module_tasks.tasks.flow_input is
  'Static flow input copied from the template at materialization.';
