-- Outcome bindings: destinations a routine fire can deliver to, parallel
-- to ai.routine_triggers (wake sources). A routine with no rows keeps the
-- legacy `report` desk post. Rows replace that post.
--
-- The delivery ledger is the idempotency gate: a replayed settle or a
-- repeated outcomes_deliver call must not send twice.

create table ai.routine_outcomes (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants (id) on delete cascade,
  routine_id uuid not null references ai.routines (id) on delete cascade,
  provider_id text not null,
  enabled boolean not null default true,
  mode text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_outcomes_mode_check check (mode in ('always', 'agent'))
);

comment on table ai.routine_outcomes is
  'Destinations a routine fire delivers to. Parallel to ai.routine_triggers.';
comment on column ai.routine_outcomes.provider_id is
  'Registered outcome provider id (desk.chat, notification.high, webhook, …).';
comment on column ai.routine_outcomes.mode is
  'always = settle fires it; agent = only when the run calls outcomes_deliver.';
comment on column ai.routine_outcomes.config is
  'Standing settings validated against the provider config schema. The run cannot change this.';

create index routine_outcomes_routine_idx on ai.routine_outcomes (routine_id);
create index routine_outcomes_tenant_provider_idx
  on ai.routine_outcomes (tenant_id, provider_id);

create table ai.routine_outcome_deliveries (
  id uuid primary key default public.uuidv7(),
  tenant_id uuid not null references core.tenants (id) on delete cascade,
  run_id uuid not null,
  outcome_id uuid not null references ai.routine_outcomes (id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_outcome_deliveries_status_check
    check (status in ('pending', 'sent', 'failed')),
  constraint routine_outcome_deliveries_idempotency
    unique (run_id, outcome_id, idempotency_key)
);

comment on table ai.routine_outcome_deliveries is
  'Idempotency ledger for routine outcome delivery. Unique on (run, binding, key).';

create index routine_outcome_deliveries_tenant_run_idx
  on ai.routine_outcome_deliveries (tenant_id, run_id);
create index routine_outcome_deliveries_outcome_idx
  on ai.routine_outcome_deliveries (outcome_id);

-- Artifact a routine outcome pointed at, so later deliveries and the desk
-- know where the run's document is. The document itself is ai.artifact.
alter table ai.workflow_run
  add column if not exists artifact_pointer jsonb;

comment on column ai.workflow_run.artifact_pointer is
  'Artifact a routine outcome pointed at: {id, title}. Not the document itself.';

alter table ai.routine_outcomes enable row level security;
alter table ai.routine_outcome_deliveries enable row level security;

grant select, insert, update, delete on ai.routine_outcomes to engenty_server;
grant select, insert, update, delete on ai.routine_outcomes to service_role;
grant select, insert, update, delete on ai.routine_outcomes to authenticated;

grant select, insert, update, delete on ai.routine_outcome_deliveries to engenty_server;
grant select, insert, update, delete on ai.routine_outcome_deliveries to service_role;
grant select on ai.routine_outcome_deliveries to authenticated;

create policy srv_tenant_isolation on ai.routine_outcomes
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

create policy srv_tenant_isolation on ai.routine_outcome_deliveries
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

create policy routine_outcomes_select on ai.routine_outcomes
  for select to authenticated
  using (tenant_id = (select core.current_tenant_id()));
create policy routine_outcomes_insert on ai.routine_outcomes
  for insert to authenticated
  with check (tenant_id = (select core.current_tenant_id()));
create policy routine_outcomes_update on ai.routine_outcomes
  for update to authenticated
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));
create policy routine_outcomes_delete on ai.routine_outcomes
  for delete to authenticated
  using (tenant_id = (select core.current_tenant_id()));

create policy routine_outcome_deliveries_select on ai.routine_outcome_deliveries
  for select to authenticated
  using (tenant_id = (select core.current_tenant_id()));
