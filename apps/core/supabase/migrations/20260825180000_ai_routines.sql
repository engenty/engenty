-- Routines become their own record.
--
-- Until now a routine was a `module_tasks.triggers` row plus a "standing task"
-- it woke on every fire: the job's instructions lived in a work item, the run
-- mutex was that item's checkout column, and a board full of cards nobody could
-- ever finish was the price. A daily standup is not one forever-task with a
-- cron on it.
--
-- A routine is now a job on a mounted specialist: an action to run plus a wake
-- source. Each fire starts a RUN (`ai.action_request`), never a Task. Tasks go
-- back to being work items, and may be the optional SUBJECT of a run.
--
-- The wake fields are lifted verbatim from the trigger row — this is the same
-- scheduler contract, re-homed. `schedule_id` replaces `heartbeat_id` (Mastra
-- 1.50+ calls the ticker a schedule); the Mastra row stays DERIVED state that
-- heartbeat-sync reconciles, never a second source of truth.
--
-- See docs/content/dev/work-model.md for the noun contract.

create table if not exists ai.routines (
  id uuid default public.uuidv7() not null primary key,
  tenant_id uuid not null references core.tenants (id) on delete cascade,

  -- Containment. Composite FK so a routine cannot point at another tenant's
  -- Space (same trap-avoidance as ai.thread / core.space_mount).
  space_id uuid,

  -- The mounted specialist that owns this job. Text, matching
  -- ai.engenty_ai_agents.agent_id — module routines may name a platform agent.
  agent_id text not null,

  name text not null,
  description text,

  -- Provenance, not kind: 'module' rows are reconciled from a ROUTINE.md
  -- declaration and their declaration-owned fields follow the file.
  source text not null default 'custom',
  module_id text,
  declaration_id text,

  -- WHAT RUNS ------------------------------------------------------------
  -- 'action'  → a published action (ai.flow_graph) with static input.
  -- 'prompt'  → operating text, compiled to a one-node action on first run.
  -- Exactly one of the two bodies is populated; enforced by the check below.
  target_kind text not null default 'prompt',
  action_id uuid references ai.flow_graph (id) on delete restrict,
  action_input jsonb not null default '{}'::jsonb,
  instructions text,

  -- WHEN IT WAKES --------------------------------------------------------
  -- Lifted from module_tasks.triggers; 'manual' means run-now only (no clock),
  -- and manual routines are deliberately absent from the routines list.
  kind text not null default 'schedule',
  cron text,
  timezone text,
  enabled boolean not null default true,
  quiet_hours text,
  provider_id text,
  resource text,
  event_filter jsonb,
  input_mapping jsonb,
  webhook_secret text,

  -- The derived Mastra schedule. Null for event/manual routines — those have
  -- no ticker (heartbeat-sync returns null for kind <> 'schedule').
  schedule_id text,

  -- HOW IT BEHAVES -------------------------------------------------------
  -- The unattended allow-list: operations a fire may call without parking for
  -- approval. Was trigger.approval_grants; unchanged semantics.
  approval_grants text[] not null default '{}',

  -- What the desk shows when a run finishes.
  --   quiet     — nothing; check the Runs tab
  --   desk_card — a compact card with the run's summary (default)
  --   ask       — the run may suspend and ask on the desk
  report text not null default 'desk_card',

  -- What the routine SAID it would do — a promise, not a result. Moved off the
  -- standing task, where it was indistinguishable from a work item's outcome.
  outcome text,

  -- Unattended fires act as the AI service principal, but resolve their Space
  -- surface as this user: without it a routine in a private Space has every
  -- module tool refused. The human who configured the routine.
  created_by_user_id uuid references core.users (id) on delete set null,

  last_fired_at timestamp with time zone,
  last_result text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,

  constraint routines_source_check
    check (source in ('custom', 'module')),
  constraint routines_kind_check
    check (kind in ('schedule', 'event', 'manual')),
  constraint routines_report_check
    check (report in ('quiet', 'desk_card', 'ask')),
  constraint routines_target_check
    check (
      (target_kind = 'action' and action_id is not null)
      or (target_kind = 'prompt' and instructions is not null)
    ),
  -- A schedule routine without a cron would sync no ticker and never fire —
  -- an invisible no-op, so it is refused at write time instead.
  constraint routines_schedule_needs_cron
    check (kind <> 'schedule' or cron is not null)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'routines_space_fk'
  ) then
    alter table ai.routines
      add constraint routines_space_fk
      foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
      on delete set null (space_id);
  end if;
end $$;

create index if not exists routines_tenant_space_idx
  on ai.routines (tenant_id, space_id);
create index if not exists routines_tenant_agent_idx
  on ai.routines (tenant_id, agent_id);
-- The reconcile sweep lists every enabled schedule routine per tenant.
create index if not exists routines_tenant_kind_enabled_idx
  on ai.routines (tenant_id, kind, enabled);
-- A module declaration reconciles to exactly one row per tenant.
create unique index if not exists routines_tenant_declaration_idx
  on ai.routines (tenant_id, declaration_id)
  where declaration_id is not null;

alter table ai.routines enable row level security;

-- Dropped first so the whole migration is re-runnable: `create policy` has no
-- `if not exists`, and a re-run against a database that already has the table
-- would otherwise abort here.
drop policy if exists routines_select on ai.routines;
create policy routines_select on ai.routines
  for select using (tenant_id = core.current_tenant_id());
drop policy if exists routines_insert on ai.routines;
create policy routines_insert on ai.routines
  for insert with check (tenant_id = core.current_tenant_id());
drop policy if exists routines_update on ai.routines;
create policy routines_update on ai.routines
  for update using (tenant_id = core.current_tenant_id());
drop policy if exists routines_delete on ai.routines;
create policy routines_delete on ai.routines
  for delete using (tenant_id = core.current_tenant_id());

grant select, insert, update, delete on table ai.routines to service_role;
grant select, insert, update, delete on table ai.routines to authenticated;
grant select, insert, update, delete on table ai.routines to engenty_server;

drop policy if exists srv_tenant_isolation on ai.routines;
create policy srv_tenant_isolation on ai.routines
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

comment on table ai.routines is
  'A job on a mounted specialist: an action to run plus a wake source. Each fire starts a Run (ai.action_request), never a Task.';
comment on column ai.routines.schedule_id is
  'Derived Mastra schedule id. Reconciled by apps/ai scheduler; never a second source of truth. Null for event/manual routines.';
comment on column ai.routines.approval_grants is
  'Operations an unattended fire may call without parking for approval.';
comment on column ai.routines.created_by_user_id is
  'Whose Space surface an unattended fire resolves as. The fire itself acts as the AI service principal.';
comment on column ai.routines.outcome is
  'What the routine promises to do — not what a run did. That is the run summary.';

-- ---------------------------------------------------------------------------
-- The run index learns about routines.
-- ---------------------------------------------------------------------------

-- Which routine produced this run. Null for presses, chat and task-subject
-- runs. Also the overlap key: a fire is skipped while this routine's previous
-- run is still active.
alter table ai.action_request
  add column if not exists routine_id uuid references ai.routines (id) on delete set null;

-- The one-line result the desk card shows ("Created 3 contacts"). `reason`
-- carries failure detail and is the wrong place for a success summary.
alter table ai.action_request
  add column if not exists summary text;

create index if not exists action_request_tenant_routine_idx
  on ai.action_request (tenant_id, routine_id, created_at desc)
  where routine_id is not null;

comment on column ai.action_request.routine_id is
  'The routine whose fire started this run. Null for presses, chat, and task-subject runs. Overlap is decided on this column.';
comment on column ai.action_request.summary is
  'One-line result for the desk card. Distinct from reason, which explains a failure.';

-- 'task' joins the trigger vocabulary: a run whose subject is a work item,
-- started by assigning that item to a specialist. Schedule fires stay 'cron'
-- and event/webhook fires stay 'hook'.
alter table ai.action_request
  drop constraint if exists action_request_trigger_check;
alter table ai.action_request
  add constraint action_request_trigger_check
  check (
    trigger in (
      'message', 'command', 'button', 'cron', 'hook', 'direct', 'task'
    )
  );

alter table ai.agent_run
  drop constraint if exists agent_run_trigger_check;
alter table ai.agent_run
  add constraint agent_run_trigger_check
  check (
    trigger is null
    or trigger in (
      'message', 'command', 'button', 'cron', 'hook', 'direct', 'task'
    )
  );

comment on column ai.agent_run.trigger is
  'How the run started: message | command | button | cron | hook | direct | task. Null = unknown (rows predating the column); readers must not substitute a default.';
