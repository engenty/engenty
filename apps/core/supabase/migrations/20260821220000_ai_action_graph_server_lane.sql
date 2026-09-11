-- action_graph was created before the engenty_server bulk grant re-ran on this
-- database (or applied incrementally after 20260809200000). Without the server
-- lane GRANT, leak-harness cannot SELECT and the tenant-locked AI lane cannot
-- load flows. Idempotent: re-grant + recreate the standard isolation policy.

grant select, insert, update, delete on ai.action_graph to engenty_server;
grant select, insert, update, delete on ai.action_graph_version to engenty_server;

drop policy if exists srv_tenant_isolation on ai.action_graph;
create policy srv_tenant_isolation on ai.action_graph
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

drop policy if exists srv_tenant_isolation on ai.action_graph_version;
create policy srv_tenant_isolation on ai.action_graph_version
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));
