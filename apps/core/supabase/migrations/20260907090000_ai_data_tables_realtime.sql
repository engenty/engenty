-- Realtime for Space tables. The table view in the Data tab and an App that
-- declares a table (manifest.engenty.tables) follow agent writes as they land
-- instead of waiting for a reload. Same shape as ai.artifact
-- (20260713163900_ai_artifacts_realtime.sql): the browser subscribes as
-- `authenticated`, so it needs SELECT plus a tenant RLS policy that realtime
-- evaluates per subscriber; replica identity full lets a DELETE carry the
-- filter column (table_id).

grant usage on schema ai to authenticated;
grant select on table ai.data_table to authenticated;
grant select on table ai.data_table_row to authenticated;

drop policy if exists data_table_select_tenant on ai.data_table;
create policy data_table_select_tenant on ai.data_table
  for select to authenticated
  using (tenant_id = core.current_tenant_id());

drop policy if exists data_table_row_select_tenant on ai.data_table_row;
create policy data_table_row_select_tenant on ai.data_table_row
  for select to authenticated
  using (tenant_id = core.current_tenant_id());

alter table ai.data_table replica identity full;
alter table ai.data_table_row replica identity full;

do $$
begin
  alter publication supabase_realtime add table ai.data_table;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table ai.data_table_row;
exception
  when duplicate_object then null;
end $$;
