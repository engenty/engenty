-- Tasks settings live on core.tenant_settings (typed KV), not a
-- module-owned duplicate. Copy any existing rows, then drop the table.

do $$
begin
  if to_regclass('module_tasks.tenant_settings') is null then
    return;
  end if;

  insert into core.tenant_settings (
    tenant_id, scope_id, name, type,
    value_string, value_jsonb, value_numeric, value_boolean, updated_at
  )
  select
    ts.tenant_id,
    ts.scope_id,
    'tasks.identifier_prefix',
    'string',
    coalesce(nullif(trim(ts.identifier_prefix), ''), 'ENG'),
    null,
    null,
    null,
    now()
  from module_tasks.tenant_settings ts
  on conflict (tenant_id, scope_id, name) do update
    set type = excluded.type,
        value_string = excluded.value_string,
        value_jsonb = null,
        value_numeric = null,
        value_boolean = null,
        updated_at = now();

  insert into core.tenant_settings (
    tenant_id, scope_id, name, type,
    value_string, value_jsonb, value_numeric, value_boolean, updated_at
  )
  select
    ts.tenant_id,
    ts.scope_id,
    'tasks.stale_after_days',
    'numeric',
    null,
    null,
    ts.stale_after_days,
    null,
    now()
  from module_tasks.tenant_settings ts
  on conflict (tenant_id, scope_id, name) do update
    set type = excluded.type,
        value_string = null,
        value_jsonb = null,
        value_numeric = excluded.value_numeric,
        value_boolean = null,
        updated_at = now();

  insert into core.tenant_settings (
    tenant_id, scope_id, name, type,
    value_string, value_jsonb, value_numeric, value_boolean, updated_at
  )
  select
    ts.tenant_id,
    ts.scope_id,
    'tasks.status_definitions',
    'json',
    null,
    jsonb_build_object(
      'items',
      coalesce(ts.task_status_definitions, '[]'::jsonb)
    ),
    null,
    null,
    now()
  from module_tasks.tenant_settings ts
  on conflict (tenant_id, scope_id, name) do update
    set type = excluded.type,
        value_string = null,
        value_jsonb = excluded.value_jsonb,
        value_numeric = null,
        value_boolean = null,
        updated_at = now();

  drop table if exists module_tasks.tenant_settings;
end $$;

notify pgrst, 'reload schema';
