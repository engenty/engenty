-- Server-lane hygiene, found by the nightly db-checks lane
-- (scripts/check-server-lane-coverage.mjs) once its grants step could run.
--
-- 1. notifications_select and notification_seen_select date from the initial
--    schema and call auth.uid() directly. Schema `auth` is unreachable for the
--    migration-managed roles, and policies are OR-combined, so one such policy
--    breaks its whole table for the engenty_server lane at plan time. Rewrite
--    them on core.current_user_id() and scope them to `authenticated`: the
--    helper casts the JWT subject to uuid, which is only a user id on the
--    browser lane. The server lane keeps its own srv_tenant_isolation pair on
--    both tables (already in place); service_role bypasses RLS.
drop policy if exists notification_seen_select on core.notification_seen;
create policy notification_seen_select on core.notification_seen
  for select to authenticated
  using (
    tenant_id = (select core.current_tenant_id())
    and user_id = (select core.current_user_id())
  );

drop policy if exists notifications_select on core.notifications;
create policy notifications_select on core.notifications
  for select to authenticated
  using (
    tenant_id = (select core.current_tenant_id())
    and (
      audience_kind in ('tenant', 'stream')
      or (
        audience_kind = 'user'
        and audience_id = (select core.current_user_id())::text
      )
      or (
        audience_kind = 'space'
        and exists (
          select 1
          from core.spaces s
          where s.tenant_id = (select core.current_tenant_id())
            and s.id::text = notifications.audience_id
            and s.deleted_at is null
            and (
              s.visibility <> 'private'
              or s.owner_user_id = (select core.current_user_id())
              or exists (
                select 1
                from core.space_member m
                where m.tenant_id = s.tenant_id
                  and m.space_id = s.id
                  and m.user_id = (select core.current_user_id())
              )
            )
        )
      )
    )
  );

-- 2. The MCP tables shipped their server-lane pair under bespoke names
--    (srv_mcp_client_grants, srv_mcp_tasks). The check looks for the canonical
--    srv_tenant_isolation on every tenant table, and the name is the contract
--    every other table honours — rename rather than allow-list.
alter policy srv_mcp_client_grants on core.mcp_client_grants
  rename to srv_tenant_isolation;
alter policy srv_mcp_tasks on core.mcp_tasks
  rename to srv_tenant_isolation;
