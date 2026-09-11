-- Space delete now has a guarded endpoint (mark, then purge). The RESTRICT
-- FKs were the placeholder until that existed; CASCADE is the real "delete
-- this space and the work in it" behaviour the purge function relies on as
-- a second line if a module table is missed in core.purge_space.
--
-- Guarded: goals, templates, and triggers have been dropped on current
-- installs but may still exist on a lagging database.

do $$
declare
  tbl text;
begin
  foreach tbl in array array['tasks', 'goals', 'task_templates', 'triggers']
  loop
    if to_regclass(format('module_tasks.%I', tbl)) is null then
      continue;
    end if;
    execute format(
      'alter table module_tasks.%I drop constraint if exists %I',
      tbl,
      tbl || '_space_tenant_fkey'
    );
    execute format(
      'alter table module_tasks.%I
         add constraint %I
         foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
         on delete cascade',
      tbl,
      tbl || '_space_tenant_fkey'
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';
