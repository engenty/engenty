-- A person's standing consent for their browser in a space
-- (PLAN-user-browser.md D3, §2.2).
--
-- One row per (tenant, space, user). The row's existence is nothing — a
-- browser exists when its container does — what the row carries is
-- `unattended`: whether an agent may drive this person's logged-in browser
-- while they are NOT at the keyboard (a routine firing at 03:00, a task job).
-- Without it, every headless run that reaches for the browser stops with
-- `needs_user`. An attended chat turn never consults it: the person is there.
--
-- Its own table, not an `approval_grants` scope: a grant there is a
-- per-operation approval with a goal/task/routine axis, while this is a
-- standing fact about a resource (the browser) with a user × space axis the
-- approval store has no column for.
--
-- Idempotent: guarded creates, drop-policy-first, re-grants.

create table if not exists core.space_browser_grants (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  space_id uuid not null,
  user_id uuid not null,
  unattended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, space_id, user_id),
  constraint space_browser_grants_space_tenant_fkey
    foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
    on delete cascade,
  constraint space_browser_grants_user_tenant_fkey
    foreign key (user_id, tenant_id) references core.users (id, tenant_id)
    on delete cascade
);

comment on table core.space_browser_grants is
  'Per user × space consent for the user''s own browser: unattended = agents may drive it while the user is away.';

alter table core.space_browser_grants enable row level security;

-- Server lane only: the surface route and the grant routes read and write it
-- on the tenant-locked handle. Nothing in the browser lane needs a direct read.
grant select, insert, update, delete on core.space_browser_grants to engenty_server;

drop policy if exists srv_tenant_isolation on core.space_browser_grants;
create policy srv_tenant_isolation on core.space_browser_grants
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));
