-- Routine unification: triggers become child rows, everything becomes a routine.
--
-- The routine is the user-facing entity: name, promise (outcome), reporting,
-- the bound workflow. A trigger is one wake source ON it — a routine may have
-- several (a schedule AND a webhook AND the agent itself), and pausing one
-- must not pause the others. Two new kinds join the vocabulary:
--   'manual' — a person fires it (run form / shortcode)
--   'agent'  — the owning specialist may fire it via invoke_action
-- Both are enforced at the fire door, so turning one off actually closes it.
--
-- Wake fields move OFF ai.routines onto the child table; the routine keeps
-- behaviour (outcome, report, quiet_hours, approval_grants, action_input) and
-- its master `enabled` switch. A fire is effective-enabled only when routine
-- AND trigger both are.

create table if not exists ai.routine_triggers (
  id uuid default public.uuidv7() not null primary key,
  tenant_id uuid not null references core.tenants (id) on delete cascade,
  routine_id uuid not null references ai.routines (id) on delete cascade,

  kind text not null,
  -- schedule
  cron text,
  timezone text,
  -- event
  provider_id text,
  resource text,
  event_filter jsonb,
  -- how this wake source's payload becomes the workflow's input
  input_mapping jsonb,
  -- webhook credential (event kind, provider 'webhook')
  webhook_secret text,
  -- manual kind: a short key a person can invoke the routine by
  shortcode text,

  -- Derived Mastra schedule id (schedule kind only); reconciled, never authored.
  schedule_id text,

  enabled boolean not null default true,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,

  constraint routine_triggers_kind_check
    check (kind in ('schedule', 'event', 'manual', 'agent')),
  constraint routine_triggers_schedule_needs_cron
    check (kind <> 'schedule' or cron is not null)
);

create index if not exists routine_triggers_routine_idx
  on ai.routine_triggers (routine_id);
create index if not exists routine_triggers_tenant_kind_enabled_idx
  on ai.routine_triggers (tenant_id, kind, enabled);

alter table ai.routine_triggers enable row level security;

drop policy if exists routine_triggers_select on ai.routine_triggers;
create policy routine_triggers_select on ai.routine_triggers
  for select using (tenant_id = core.current_tenant_id());
drop policy if exists routine_triggers_insert on ai.routine_triggers;
create policy routine_triggers_insert on ai.routine_triggers
  for insert with check (tenant_id = core.current_tenant_id());
drop policy if exists routine_triggers_update on ai.routine_triggers;
create policy routine_triggers_update on ai.routine_triggers
  for update using (tenant_id = core.current_tenant_id());
drop policy if exists routine_triggers_delete on ai.routine_triggers;
create policy routine_triggers_delete on ai.routine_triggers
  for delete using (tenant_id = core.current_tenant_id());

grant select, insert, update, delete on table ai.routine_triggers to service_role;
grant select, insert, update, delete on table ai.routine_triggers to authenticated;
grant select, insert, update, delete on table ai.routine_triggers to engenty_server;

drop policy if exists srv_tenant_isolation on ai.routine_triggers;
create policy srv_tenant_isolation on ai.routine_triggers
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

comment on table ai.routine_triggers is
  'One wake source of a routine. A routine has 1..n; a fire is allowed only when routine and trigger are both enabled.';
comment on column ai.routine_triggers.shortcode is
  'Manual kind: a short key a person can invoke the routine by.';
comment on column ai.routine_triggers.schedule_id is
  'Derived Mastra schedule id (schedule kind only). Reconciled by apps/ai; never a second source of truth.';

-- ---------------------------------------------------------------------------
-- Backfill: each existing routine's wake columns become its first trigger row.
-- ---------------------------------------------------------------------------

insert into ai.routine_triggers (
  tenant_id, routine_id, kind, cron, timezone, provider_id, resource,
  event_filter, input_mapping, webhook_secret, schedule_id, enabled
)
select
  r.tenant_id, r.id, r.kind, r.cron, r.timezone, r.provider_id, r.resource,
  r.event_filter, r.input_mapping, r.webhook_secret, r.schedule_id, true
from ai.routines r
where not exists (
  select 1 from ai.routine_triggers t where t.routine_id = r.id
);

-- ---------------------------------------------------------------------------
-- Wrap: every agent-owned workflow without a routine gets one. "No standalone
-- actions" — the routine is where its triggers and outcome live from now on.
-- ---------------------------------------------------------------------------

-- `kind` still exists at this point (dropped below) and defaults to
-- 'schedule', whose check demands a cron — set it to 'manual' explicitly.
insert into ai.routines (
  tenant_id, agent_id, name, description, source,
  workflow_id, report, enabled, kind
)
select
  g.tenant_id, g.owner_agent_id, coalesce(g.title, g.name),
  g.description, 'custom', g.id, 'desk_card', true, 'manual'
from ai.flow_graph g
where g.owner_agent_id is not null
  and not exists (
    select 1 from ai.routines r where r.workflow_id = g.id
  );

-- ---------------------------------------------------------------------------
-- Defaults: every routine can be pressed and invoked today; keep that true —
-- but as explicit, togglable trigger rows.
-- ---------------------------------------------------------------------------

insert into ai.routine_triggers (tenant_id, routine_id, kind, enabled)
select r.tenant_id, r.id, k.kind, true
from ai.routines r
cross join (values ('manual'), ('agent')) as k (kind)
where not exists (
  select 1 from ai.routine_triggers t
  where t.routine_id = r.id and t.kind = k.kind
);

-- ---------------------------------------------------------------------------
-- The moved columns leave ai.routines. Hard cutover; the child table is the
-- only place wake sources live now.
-- ---------------------------------------------------------------------------

drop index if exists ai.routines_tenant_kind_enabled_idx;
alter table ai.routines
  drop constraint if exists routines_kind_check,
  drop constraint if exists routines_schedule_needs_cron;
alter table ai.routines
  drop column if exists kind,
  drop column if exists cron,
  drop column if exists timezone,
  drop column if exists provider_id,
  drop column if exists resource,
  drop column if exists event_filter,
  drop column if exists input_mapping,
  drop column if exists webhook_secret,
  drop column if exists schedule_id;
