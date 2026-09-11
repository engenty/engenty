-- Invocation parity: inline task-template + trigger creation is one transaction,
-- and retried manual invocations reuse the Task created by the first attempt.

alter table module_tasks.tasks
  add column if not exists invocation_key text;

create unique index if not exists idx_module_tasks_trigger_invocation
  on module_tasks.tasks (tenant_id, scope_id, trigger_id, invocation_key)
  where trigger_id is not null and invocation_key is not null;

comment on column module_tasks.tasks.invocation_key is
  'Caller-stable key for idempotent trigger fires; null for ordinary task creation.';

create or replace function module_tasks.create_trigger_with_template(
  p_tenant_id uuid,
  p_scope_id text,
  p_created_by_user_id uuid,
  p_template jsonb,
  p_trigger jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_template_id uuid := gen_random_uuid();
  v_trigger_id uuid := gen_random_uuid();
  v_space_id uuid := (p_trigger ->> 'space_id')::uuid;
  v_template_space_id uuid :=
    coalesce((p_template ->> 'space_id')::uuid, v_space_id);
begin
  if v_space_id is null or v_template_space_id is null then
    raise exception 'trigger_and_template_require_space';
  end if;
  if v_space_id <> v_template_space_id then
    raise exception 'trigger_template_space_mismatch';
  end if;

  insert into module_tasks.task_templates (
    id,
    tenant_id,
    scope_id,
    name,
    title,
    description,
    agent_type_key,
    action_graph_id,
    flow_input,
    priority,
    space_id,
    created_by_user_id
  ) values (
    v_template_id,
    p_tenant_id,
    p_scope_id,
    p_template ->> 'name',
    p_template ->> 'title',
    p_template ->> 'description',
    nullif(p_template ->> 'agent_type_key', ''),
    nullif(p_template ->> 'action_graph_id', '')::uuid,
    coalesce(p_template -> 'flow_input', '{}'::jsonb),
    coalesce(p_template ->> 'priority', 'medium'),
    v_template_space_id,
    p_created_by_user_id
  );

  insert into module_tasks.triggers (
    id,
    tenant_id,
    scope_id,
    name,
    description,
    kind,
    task_template_id,
    enabled,
    cron,
    timezone,
    quiet_hours,
    provider_id,
    resource,
    event_filter,
    input_mapping,
    source,
    module_id,
    module_key,
    approval_grants,
    webhook_secret,
    space_id,
    created_by_user_id
  ) values (
    v_trigger_id,
    p_tenant_id,
    p_scope_id,
    p_trigger ->> 'name',
    p_trigger ->> 'description',
    p_trigger ->> 'kind',
    v_template_id,
    coalesce((p_trigger ->> 'enabled')::boolean, true),
    p_trigger ->> 'cron',
    p_trigger ->> 'timezone',
    p_trigger ->> 'quiet_hours',
    p_trigger ->> 'provider_id',
    p_trigger ->> 'resource',
    p_trigger -> 'event_filter',
    p_trigger -> 'input_mapping',
    coalesce(p_trigger ->> 'source', 'custom'),
    p_trigger ->> 'module_id',
    p_trigger ->> 'module_key',
    coalesce(
      array(select jsonb_array_elements_text(p_trigger -> 'approval_grants')),
      array[]::text[]
    ),
    p_trigger ->> 'webhook_secret',
    v_space_id,
    p_created_by_user_id
  );

  return v_trigger_id;
end;
$$;

revoke all on function module_tasks.create_trigger_with_template(
  uuid, text, uuid, jsonb, jsonb
) from public;
grant execute on function module_tasks.create_trigger_with_template(
  uuid, text, uuid, jsonb, jsonb
) to service_role;

notify pgrst, 'reload schema';
