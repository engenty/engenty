-- Variant D (PLAN-workflow-designer.md Phase 6, D3): the flow run knows which
-- Task supervises it.
--
-- Without this link the settle path can update the audit row but has no way
-- back to the task, so a gate answered days later — or a sleeping run woken by
-- the sweep — would leave the board showing work that already finished. The
-- column is the whole basis of the settle -> task mirror.
--
-- Deliberately NOT a foreign key: `module_tasks` is a module schema that may be
-- absent in an installation without the tasks module, and apps/ai must not take
-- a hard dependency on a module's tables. A dangling id simply means "no task
-- to mirror to", which the mirror already treats as a no-op.
alter table "ai"."action_request"
  add column if not exists "owner_task_id" "uuid";

create index if not exists "action_request_owner_task_idx"
  on "ai"."action_request" ("owner_task_id")
  where "owner_task_id" is not null;

comment on column "ai"."action_request"."owner_task_id" is
  'Task supervising this flow run (Variant D). Null for button/agent-started runs.';
