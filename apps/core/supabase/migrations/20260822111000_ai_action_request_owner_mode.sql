-- Keep the core app's migration bundle aligned with the root Supabase bundle.
-- A nested invoke_action binds approvals/audit to its current Task without
-- treating the flow as that Task's primary body.

alter table ai.action_request
  add column if not exists owner_task_mode text not null default 'primary'
  check (owner_task_mode in ('primary', 'nested'));

comment on column ai.action_request.owner_task_mode is
  'primary: the Task body is this flow; nested: invoke_action reused an agent Task.';
