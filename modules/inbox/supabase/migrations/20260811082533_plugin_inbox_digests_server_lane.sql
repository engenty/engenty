-- Server-lane reachability for inbox digests (Phase A).
--
-- message_digests / thread_digests landed with the optimized-view work and only
-- granted service_role (+ authenticated SELECT). On installs that already had
-- 20260809200000_core_engenty_server_lane applied, the one-shot generator never
-- saw these tables — so the engenty_server gateway lane gets
-- "permission denied for table message_digests" when opening a thread.
--
-- Plain tenant_id columns → standard srv_tenant_isolation shape.
-- Idempotent: enable RLS + grant + drop-policy-if-exists.

alter table module_inbox.message_digests enable row level security;
alter table module_inbox.thread_digests enable row level security;

grant select, insert, update, delete
  on module_inbox.message_digests to engenty_server;
grant select, insert, update, delete
  on module_inbox.thread_digests to engenty_server;

-- Browser lane already has SELECT grants from the create migration; keep a
-- visibility policy so enabling RLS does not silently lock authenticated out
-- if a client ever reads digests directly.
drop policy if exists message_digests_read_visible on module_inbox.message_digests;
create policy message_digests_read_visible on module_inbox.message_digests
  for select to authenticated
  using (
    tenant_id = (select core.current_tenant_id())
    and core.has_scope(scope_id)
    and (
      owner_user_id is null
      or owner_user_id = (select core.current_user_id())
    )
  );

drop policy if exists thread_digests_read_visible on module_inbox.thread_digests;
create policy thread_digests_read_visible on module_inbox.thread_digests
  for select to authenticated
  using (
    tenant_id = (select core.current_tenant_id())
    and core.has_scope(scope_id)
    and (
      owner_user_id is null
      or owner_user_id = (select core.current_user_id())
    )
  );

drop policy if exists srv_tenant_isolation on module_inbox.message_digests;
create policy srv_tenant_isolation
  on module_inbox.message_digests
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

drop policy if exists srv_tenant_isolation on module_inbox.thread_digests;
create policy srv_tenant_isolation
  on module_inbox.thread_digests
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

-- Category-aware list_threads was recreated with only service_role EXECUTE.
grant execute on function module_inbox.list_threads(uuid, text, uuid, int, int, uuid, text, text)
  to engenty_server;

notify pgrst, 'reload schema';
