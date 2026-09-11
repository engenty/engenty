-- Phase 1: Action / flow_graph → Workflow.
--
-- The published runnable is a Workflow (Mastra graph + tenant sugar). Routine
-- stays the job. action_request is the invocation audit row → workflow_run.
-- Leftover "action" / "flow_graph" identifiers after this file are history.

do $$
begin
  if to_regclass('ai.flow_graph') is null then
    return;
  end if;

  alter table ai.flow_graph_version rename column flow_graph_id to workflow_id;
  alter table ai.flow_graph rename column source_action_id to source_workflow_id;
  alter table ai.action_request rename column flow_graph_version_id to workflow_version_id;
  alter table ai.action_request rename column action_id to workflow_id;
  alter table ai.routines rename column action_input to workflow_input;

  alter table ai.flow_graph_version rename to workflow_version;
  alter table ai.flow_graph rename to workflow;
  alter table ai.action_request rename to workflow_run;

  -- Constraints (renaming a pkey/unique also renames its index).
  alter table ai.workflow rename constraint flow_graph_pkey to workflow_pkey;
  alter table ai.workflow rename constraint flow_graph_status_check to workflow_status_check;
  alter table ai.workflow rename constraint flow_graph_active_needs_version to workflow_active_needs_version;
  alter table ai.workflow rename constraint flow_graph_tenant_id_fkey to workflow_tenant_id_fkey;
  alter table ai.workflow rename constraint flow_graph_created_by_user_id_fkey to workflow_created_by_user_id_fkey;

  alter table ai.workflow_version rename constraint flow_graph_version_pkey to workflow_version_pkey;
  alter table ai.workflow_version rename constraint flow_graph_version_unique to workflow_version_unique;
  alter table ai.workflow_version rename constraint flow_graph_version_authored_by_check to workflow_version_authored_by_check;
  alter table ai.workflow_version rename constraint flow_graph_version_flow_graph_id_fkey to workflow_version_workflow_id_fkey;
  alter table ai.workflow_version rename constraint flow_graph_version_tenant_id_fkey to workflow_version_tenant_id_fkey;
  alter table ai.workflow_version rename constraint flow_graph_version_created_by_user_id_fkey to workflow_version_created_by_user_id_fkey;
  alter table ai.workflow_version rename constraint flow_graph_version_approved_by_user_id_fkey to workflow_version_approved_by_user_id_fkey;

  alter table ai.workflow_run rename constraint action_request_pkey to workflow_run_pkey;
  alter table ai.workflow_run rename constraint action_request_flow_graph_version_id_fkey to workflow_run_workflow_version_id_fkey;
  alter table ai.workflow_run rename constraint action_request_outcome_check to workflow_run_outcome_check;
  alter table ai.workflow_run rename constraint action_request_owner_task_mode_check to workflow_run_owner_task_mode_check;
  alter table ai.workflow_run rename constraint action_request_reporting_check to workflow_run_reporting_check;
  alter table ai.workflow_run rename constraint action_request_routine_id_fkey to workflow_run_routine_id_fkey;
  alter table ai.workflow_run rename constraint action_request_run_id_fkey to workflow_run_run_id_fkey;
  alter table ai.workflow_run rename constraint action_request_session_id_fkey to workflow_run_thread_id_fkey;
  alter table ai.workflow_run rename constraint action_request_status_check to workflow_run_status_check;
  alter table ai.workflow_run rename constraint action_request_tenant_id_fkey to workflow_run_tenant_id_fkey;
  alter table ai.workflow_run rename constraint action_request_trigger_check to workflow_run_trigger_check;

  if exists (
    select 1 from pg_constraint
    where conname = 'routines_action_id_fkey' and conrelid = 'ai.routines'::regclass
  ) then
    alter table ai.routines rename constraint routines_action_id_fkey to routines_workflow_id_fkey;
  end if;

  alter index ai.flow_graph_tenant_owner_name_idx rename to workflow_tenant_owner_name_idx;
  alter index ai.flow_graph_tenant_source_action_idx rename to workflow_tenant_source_workflow_idx;
  alter index ai.flow_graph_version_tenant_graph_idx rename to workflow_version_tenant_graph_idx;
  alter index ai.action_request_graph_version_idx rename to workflow_run_graph_version_idx;
  alter index ai.action_request_owner_task_idx rename to workflow_run_owner_task_idx;
  alter index ai.action_request_session_created_idx rename to workflow_run_thread_created_idx;
  alter index ai.action_request_status_created_idx rename to workflow_run_status_created_idx;
  alter index ai.action_request_tenant_action_context_idx rename to workflow_run_tenant_workflow_context_idx;
  alter index ai.action_request_tenant_created_idx rename to workflow_run_tenant_created_idx;
  alter index ai.action_request_tenant_routine_idx rename to workflow_run_tenant_routine_idx;
  alter index ai.action_request_wake_at_idx rename to workflow_run_wake_at_idx;

  alter policy flow_graph_select on ai.workflow rename to workflow_select;
  alter policy flow_graph_insert on ai.workflow rename to workflow_insert;
  alter policy flow_graph_update on ai.workflow rename to workflow_update;
  alter policy flow_graph_delete on ai.workflow rename to workflow_delete;
  alter policy flow_graph_version_select on ai.workflow_version rename to workflow_version_select;
  alter policy flow_graph_version_insert on ai.workflow_version rename to workflow_version_insert;

  comment on table ai.workflow is
    'Published workflow definitions (Mastra graph + tenant sugar).';
  comment on table ai.workflow_version is
    'Immutable workflow versions. A run pins a version id.';
  comment on table ai.workflow_run is
    'Invocation audit / dedup row for a workflow run. Distinct from ai.agent_run (engine execution).';
  comment on column ai.workflow.source_workflow_id is
    'Module workflow id this row reconciles from; null on an authored workflow.';
  comment on column ai.routines.workflow_input is
    'Static input handed to the targeted workflow at fire.';
end $$;

-- Stored agent tool ids: Action names → Workflow names. Also folds every
-- historical id from the 2026-08-23/24 ping-pong onto the Phase 1 names.
do $$
begin
  if to_regclass('ai.engenty_ai_agents') is null then
    return;
  end if;

  update ai.engenty_ai_agents
  set tool_ids = (
    select coalesce(
      jsonb_agg(
        case entry
          when 'invoke_action' then 'invoke_workflow'
          when 'invoke_flow' then 'invoke_workflow'
          when 'action_propose' then 'workflow_propose'
          when 'flow_graph_propose' then 'workflow_propose'
          when 'action_graph_propose' then 'workflow_propose'
          when 'actions_list' then 'workflows_list'
          when 'flows_list' then 'workflows_list'
          else entry
        end
      ),
      '[]'::jsonb
    )
    from jsonb_array_elements_text(tool_ids) as t(entry)
  )
  where tool_ids ?| array[
    'invoke_action',
    'invoke_flow',
    'action_propose',
    'flow_graph_propose',
    'action_graph_propose',
    'actions_list',
    'flows_list'
  ];
end $$;

-- Instruction metadata: owner_kind action → workflow (if any rows exist).
update ai.engenty_instruction_overrides
set metadata = jsonb_set(metadata, '{owner_kind}', '"workflow"')
where metadata->>'owner_kind' = 'action';

