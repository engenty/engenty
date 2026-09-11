-- Routines become standing tasks; task templates retire.
--
-- A schedule routine always owned exactly ONE standing task (found by
-- tasks.trigger_id at fire time), and its template was created 1:1, inline,
-- never reused — pure ceremony that also split the instructions across two
-- description fields. The task now carries the routine body directly
-- (title / description / agent_type_key / action_graph_id / flow_input /
-- priority all pre-exist on tasks), and the trigger keeps only the wake
-- source: kind, cron/timezone/quiet_hours, event wiring, scheduler
-- bookkeeping.
--
-- `triggers.task_id` is the ownership edge (trigger → its standing task);
-- `tasks.trigger_id` stays as the backlink (grant resolution, sidebar,
-- invocation dedupe, spawned children). `spawn_per_event` opts an event
-- trigger into task-per-occurrence fan-out (children of the standing task);
-- the default delivers occurrences as runs of the standing task itself.
--
-- Guarded like every module migration: the public mirror ships core without
-- the tasks module.

do $$
declare
  g record;
  v_prefix text;
  v_next integer;
begin
  if to_regclass('module_tasks.triggers') is null then
    return;
  end if;

  alter table module_tasks.triggers
    add column if not exists task_id uuid references module_tasks.tasks(id) on delete set null;
  alter table module_tasks.triggers
    add column if not exists spawn_per_event boolean not null default false;
  alter table module_tasks.triggers
    alter column task_template_id drop not null;

  -- Adopt the standing task fires already found: the latest non-terminal task
  -- linked to each trigger.
  update module_tasks.triggers tr
  set task_id = adopted.id
  from (
    select distinct on (t.tenant_id, t.trigger_id) t.id, t.tenant_id, t.trigger_id
    from module_tasks.tasks t
    where t.trigger_id is not null
      and t.status not in ('done', 'cancelled')
    order by t.tenant_id, t.trigger_id, t.created_at desc
  ) adopted
  where adopted.trigger_id = tr.id
    and adopted.tenant_id = tr.tenant_id
    and tr.task_id is null;

  -- Materialize a standing task from the template for triggers that never
  -- fired (or whose task generation was closed). Mirrors the app-side
  -- allocator: identifier = <prefix>-<next> off task_identifier_sequences.
  if to_regclass('module_tasks.task_templates') is not null then
    for g in
      select
        tr.id as trigger_id,
        tr.tenant_id,
        tr.scope_id,
        tr.space_id,
        tr.description as trigger_description,
        tpl.title,
        tpl.description,
        tpl.agent_type_key,
        tpl.action_graph_id,
        tpl.flow_input,
        tpl.priority
      from module_tasks.triggers tr
      join module_tasks.task_templates tpl on tpl.id = tr.task_template_id
      where tr.task_id is null
    loop
      select coalesce(nullif(trim(ts.identifier_prefix), ''), 'ENG')
        into v_prefix
        from module_tasks.tenant_settings ts
        where ts.tenant_id = g.tenant_id and ts.scope_id = g.scope_id;
      v_prefix := coalesce(v_prefix, 'ENG');

      insert into module_tasks.task_identifier_sequences
        (tenant_id, scope_id, prefix, last_value)
      values (g.tenant_id, g.scope_id, v_prefix, 1)
      on conflict (tenant_id, scope_id, prefix)
      do update set last_value = module_tasks.task_identifier_sequences.last_value + 1
      returning last_value into v_next;

      with created as (
        insert into module_tasks.tasks
          (tenant_id, scope_id, identifier, title, description, status,
           priority, primary_assignee_kind, primary_assignee_agent_type_key,
           action_graph_id, flow_input, trigger_id, space_id)
        values
          (g.tenant_id, g.scope_id, v_prefix || '-' || v_next, g.title,
           -- The template summary and the trigger description (ROUTINE.md
           -- body for module routines) collapse into the ONE instructions
           -- home. The richer text wins; both present = body under summary.
           case
             when g.description is not null and g.trigger_description is not null
               then g.description || E'\n\n' || g.trigger_description
             else coalesce(g.trigger_description, g.description)
           end,
           'backlog', coalesce(g.priority, 'medium'),
           'agent', g.agent_type_key,
           g.action_graph_id, coalesce(g.flow_input, '{}'::jsonb),
           g.trigger_id, g.space_id)
        returning id
      )
      update module_tasks.triggers tr
        set task_id = (select id from created)
        where tr.id = g.trigger_id;
    end loop;
  end if;

  -- The ceremony retires: nothing reads templates any more. The RPC existed
  -- only to make the two-row insert transactional; one row needs no function.
  drop function if exists module_tasks.create_trigger_with_template(uuid, text, uuid, jsonb, jsonb);
  alter table module_tasks.triggers drop column if exists task_template_id;
  drop table if exists module_tasks.task_templates;
end $$;
