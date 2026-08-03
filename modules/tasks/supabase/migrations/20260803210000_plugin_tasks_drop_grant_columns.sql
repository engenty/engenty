-- D2 approval unification, final task-store step: the per-task grant columns
-- are gone. Approvals live in core.approval_grants (subject = task id /
-- trigger id) — backfilled by core migration 20260803201000 and dual-written
-- since — and every reader (dispatch effective-grants op, detail hydration,
-- core-side gates) already reads the core store. The trigger's
-- approval_grants column stays: it is routine CONFIG, part of the trigger's
-- definition, not an approval artifact.

alter table module_tasks.tasks
  drop column if exists approval_grants,
  drop column if exists approval_grants_once;

notify pgrst, 'reload schema';
