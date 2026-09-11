-- The routine's declared OUTCOME: what it promises to have done when a cycle
-- ends, and how loudly it reports having done it.
--
-- Both halves already existed at RUNTIME and only at runtime: the agent decided
-- per run whether a cycle was worth reporting (the ROUTINE_OK / ROUTINE_REVIEW
-- marker tokens parsed by apps/ai `routine-disposition.ts`), and the definition
-- of done was inferred from the instructions every cycle. Neither was ever
-- WRITTEN DOWN, so the routine could not say what it wanted and nobody could
-- read what it had promised.
--
-- These live on the standing task, not on the trigger, for the same reason the
-- instructions do: the trigger is the wake source, the task is the body. That
-- also means the brief step picks them up with no extra plumbing.
--
-- NOT to be confused with `module_tasks.task_runs.outcome`, which is what a run
-- DID (completed / failed / needs_approval / …). This is what the routine SAID
-- it would do — a promise, not a result.

alter table module_tasks.tasks
  add column if not exists outcome text,
  add column if not exists report_mode text;

-- Null = undeclared, which reads as `quiet`: exactly the behaviour every
-- routine has today (the agent may end a boring cycle in silence). Declaring a
-- mode raises a FLOOR — a run may report more loudly than declared, never more
-- quietly — so no existing routine changes behaviour by this migration.
alter table module_tasks.tasks
  drop constraint if exists tasks_report_mode_check;

alter table module_tasks.tasks
  add constraint tasks_report_mode_check check (
    report_mode is null or report_mode in ('quiet', 'report', 'review')
  );

comment on column module_tasks.tasks.outcome is
  'Routine promise: what a cycle must have achieved to count as done. Rendered into the run brief as "## Outcome". Prose, not a schema — an agent run answers in prose (see apps/ai compile-action.ts); a schema arrives with promotion to a flow, which has its own outputSchema.';
comment on column module_tasks.tasks.report_mode is
  'Declared floor for a routine run''s disposition: quiet (silence allowed) | report (always comment) | review (always park for a human). Null = quiet. A run may escalate above the floor, never below it.';
