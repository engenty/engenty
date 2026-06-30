-- Make module_tasks.task_contexts realtime-eligible so project task edits that
-- write only the context row (order_index / discipline / visibility / project
-- link) refresh subscribers. The table already has RLS enabled with tenant_id +
-- scope_id but no SELECT policy (API reads it as service_role). Add the same
-- tenant+scope read policy the tasks table uses — this only exposes rows the user
-- can already see via the project detail API — plus grant, replica identity, and
-- publication so realtime can deliver the change.

do $$
begin
  create policy task_contexts_read on module_tasks.task_contexts
  for select using (
    tenant_id = core.current_tenant_id() and core.has_scope(scope_id)
  );
exception
  when duplicate_object then null;
end $$;

grant usage on schema module_tasks to authenticated;
grant select on table module_tasks.task_contexts to authenticated;

alter table module_tasks.task_contexts replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_tasks.task_contexts;
exception
  when duplicate_object then null;
end $$;
