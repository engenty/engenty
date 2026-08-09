-- Server-lane reachability for connection_action_policies (Phase A,
-- PLAN-tenant-isolation-a-rls-seam.md WP4).
--
-- The engenty_server generator (20260809200000_core_engenty_server_lane.sql) only
-- covers tables carrying tenant_id; connection_action_policies is a tenantless
-- child of connections (PK connection_id+selector), so it got NO grants — i.e. it
-- was unreachable, not unprotected. But every connector action resolves policy
-- overrides through it (repo.listPolicyOverrides), so the tenant lane needs a
-- real path: an EXISTS policy through the parent connection, the same shape the
-- browser lane's connection_action_policies_read already uses. The parent lookup
-- is itself tenant-confined for engenty_server by connections' own
-- srv_tenant_isolation policy; the explicit tenant check below keeps the intent
-- readable and the initplan cached. No recursion: policies on connections never
-- reference this table.
--
-- Idempotent: drop-policy-if-exists + re-grant.

grant select, insert, update, delete
  on module_connections.connection_action_policies to engenty_server;

drop policy if exists srv_tenant_isolation
  on module_connections.connection_action_policies;

create policy srv_tenant_isolation
  on module_connections.connection_action_policies
  as permissive for all to engenty_server
  using (
    exists (
      select 1 from module_connections.connections c
      where c.id = connection_action_policies.connection_id
        and c.tenant_id = (select core.current_tenant_id())
    )
  )
  with check (
    exists (
      select 1 from module_connections.connections c
      where c.id = connection_action_policies.connection_id
        and c.tenant_id = (select core.current_tenant_id())
    )
  );

notify pgrst, 'reload schema';
