-- D2 phase 1 — one durable approval-grant store in core.
--
-- Before this, core's approval requests and the grants they produce lived in a
-- per-process Map (security/approval-service.ts): a restart lost every pending
-- request and every "allow for this session/policy" a human had already given,
-- and a second replica never saw the first one's grants at all. The tasks
-- module solved the same problem years-equivalent earlier with durable columns
-- (approval_grants / approval_grants_once); this generalizes that proven design
-- into core, where `evaluatePolicy` can actually read it.
--
-- Scope vocabulary is deliberately wider than core's current three decisions so
-- the tasks-module and goal-grant writers can fold in later without another
-- migration:
--   once    — consumed by the first matching call (the row is deleted)
--   session — valid while the granting auth session lives (session_id set)
--   policy  — standing grant for (actor, module, operation) in this tenant
--   task    — bound to a task run           (subject_id = task id)
--   trigger — bound to a trigger/routine    (subject_id = trigger id)
--   goal    — bound to a goal               (subject_id = goal id)
--
-- Requests and grants are separate tables on purpose: a request is an audit
-- record with a lifecycle (pending → approved/denied/expired) worth keeping
-- after the fact, while a grant is live authorization that gets consumed and
-- reaped. Collapsing them would make "delete the used grant" destroy history.

create table if not exists core.approval_requests (
  id            uuid primary key default uuidv7(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  actor_id      text not null,          -- principal that hit the gate
  module_id     text not null,
  operation_id  text not null,
  reason        text not null,          -- policy decision reason shown to the approver
  context       jsonb,                  -- optional call context for the approver UI
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'denied', 'expired')),
  decision      text check (decision in ('allow_once', 'allow_session', 'allow_policy', 'deny')),
  decided_by    uuid,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null    -- pending requests age out; see TTL in the service
);

-- The pending list is the inbox query: tenant + status, oldest first.
create index if not exists approval_requests_pending_idx
  on core.approval_requests (tenant_id, status, created_at);

create table if not exists core.approval_grants (
  id            uuid primary key default uuidv7(),
  tenant_id     uuid not null references core.tenants(id) on delete cascade,
  request_id    uuid references core.approval_requests(id) on delete set null,
  actor_id      text not null,
  module_id     text not null,
  operation_id  text not null,
  scope         text not null
                  check (scope in ('once', 'session', 'policy', 'task', 'trigger', 'goal')),
  -- Which session/task/trigger/goal the grant is bound to. Null for 'policy'
  -- and for 'once' grants that are not session-bound.
  subject_id    text,
  granted_by    uuid,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz             -- optional backstop TTL
);

-- consumeGrant's lookup: (tenant, actor, module, operation) then scope filter.
create index if not exists approval_grants_lookup_idx
  on core.approval_grants (tenant_id, actor_id, module_id, operation_id);

-- Reaping a finished subject (task/trigger/goal/session) is a scope+subject sweep.
create index if not exists approval_grants_subject_idx
  on core.approval_grants (tenant_id, scope, subject_id)
  where subject_id is not null;

alter table core.approval_requests enable row level security;
alter table core.approval_grants enable row level security;

-- Read-only to tenant members; every write goes through the service-role client
-- so the grant path stays server-side (a user must never insert their own grant).
create policy approval_requests_select on core.approval_requests for select
  using (tenant_id = core.current_tenant_id());
create policy approval_grants_select on core.approval_grants for select
  using (tenant_id = core.current_tenant_id());

grant select on core.approval_requests to authenticated;
grant select on core.approval_grants to authenticated;
grant select, insert, update, delete on core.approval_requests to service_role;
grant select, insert, update, delete on core.approval_grants to service_role;

notify pgrst, 'reload schema';
