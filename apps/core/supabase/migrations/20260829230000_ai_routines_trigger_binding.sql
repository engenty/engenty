-- Triggers = pure bindings on the specialist (PLAN-mounted-engentys T5.1).
--
-- The prompt lane is gone: a routine no longer carries operating text of its
-- own — it names a workflow (`ai.flow_graph`) and wakes it. `action_id`
-- becomes `workflow_id` and is REQUIRED; `target_kind`/`instructions` are
-- dropped. `action_input` (static input) and `input_mapping` (event-field
-- mapping) stay as the two halves of the fire's input.
--
-- DESTRUCTIVE BY POLICY (cutover rules 2026-08-29): rows were already wiped by
-- 20260829220000; module rows re-reconcile from agent.json trigger
-- declarations on boot.

delete from ai.routines;

alter table ai.routines
  drop constraint if exists routines_target_check;
alter table ai.routines
  drop column if exists target_kind,
  drop column if exists instructions;
alter table ai.routines rename column action_id to workflow_id;
alter table ai.routines alter column workflow_id set not null;
