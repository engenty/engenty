-- Notifications: first to answer wins (PLAN-notifications-v5.md).
--
-- A notification is a pointer to something a person can open or decide; the
-- right to decide it lives on that thing, never on the row. So a row about
-- shared work is addressed to the PLACE — the space it happens in — and
-- everyone who may enter sees it; whoever answers first closes it for all.
--
-- Three changes:
--   1. `audience_kind = 'space'` (audience_id = the space id), readable by
--      everyone who may enter the space — the tenant for a shared space,
--      the owner and members for a private one.
--   2. Seen is per viewer. A shared row is read by many people and answered
--      by one, so "seen" cannot be a row status: `core.notification_seen`
--      holds one row per (notification, person). The `seen` status and the
--      `seen_at` column go; rows that were seen are open again — nobody's
--      glance was ever an answer.
--   3. Nothing else: resolve and dismiss stay on the row.

-- 1. audience: space
alter table core.notifications
  drop constraint if exists notifications_audience_kind_check;
alter table core.notifications
  add constraint notifications_audience_kind_check
    check (audience_kind in ('tenant', 'user', 'stream', 'space'));

drop policy if exists notifications_select on core.notifications;
create policy notifications_select on core.notifications
  for select using (
    tenant_id = core.current_tenant_id()
    and (
      audience_kind in ('tenant', 'stream')
      or (audience_kind = 'user' and audience_id = auth.uid()::text)
      or (
        -- The same rule as core's listAccessibleSpaces: a space that is not
        -- private is open to the tenant; a private one to its owner (personal
        -- spaces) and its members.
        audience_kind = 'space'
        and exists (
          select 1
            from core.spaces s
           where s.tenant_id = core.current_tenant_id()
             and s.id::text = core.notifications.audience_id
             and s.deleted_at is null
             and (
               s.visibility <> 'private'
               or s.owner_user_id = auth.uid()
               or exists (
                 select 1
                   from core.space_member m
                  where m.tenant_id = s.tenant_id
                    and m.space_id = s.id
                    and m.user_id = auth.uid()
               )
             )
        )
      )
    )
  );

-- 2. seen per viewer
update core.notifications set status = 'pending' where status = 'seen';
alter table core.notifications
  drop constraint if exists notifications_status_check;
alter table core.notifications
  add constraint notifications_status_check
    check (status in ('pending', 'dismissed', 'resolved'));
alter table core.notifications drop column if exists seen_at;

create table if not exists core.notification_seen (
  tenant_id        uuid not null references core.tenants(id) on delete cascade,
  notification_id  uuid not null references core.notifications(id) on delete cascade,
  user_id          uuid not null,
  seen_at          timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index if not exists notification_seen_user_idx
  on core.notification_seen (tenant_id, user_id);

alter table core.notification_seen enable row level security;

drop policy if exists notification_seen_select on core.notification_seen;
create policy notification_seen_select on core.notification_seen
  for select using (
    tenant_id = core.current_tenant_id() and user_id = auth.uid()
  );
grant select on core.notification_seen to authenticated;
grant select, insert, update, delete on table core.notification_seen to service_role;
grant select, insert, update, delete on table core.notification_seen to engenty_server;

drop policy if exists srv_tenant_isolation on core.notification_seen;
create policy srv_tenant_isolation on core.notification_seen
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

comment on table core.notification_seen is
  'Per-person "seen" on a notification (@engenty/notifications): the row is shared, the glance is not.';

notify pgrst, 'reload schema';
