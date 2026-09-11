-- One task_runs row per run.
--
-- A resumed run re-enters `tasks_checkout` under the same run id (it parked for
-- a person, was released to `in_review`, and resumed once the answer landed).
-- Checkout inserted unconditionally, so run history listed one run twice —
-- split at the point where it stopped to ask, each fragment carrying its own
-- duration. The insert is now reopen-or-insert; this migration collapses the
-- rows that were already written and makes the invariant structural.

-- Collapse existing duplicates onto the EARLIEST row of each group: it holds
-- the run's true start. It inherits the last segment's ending, so the surviving
-- row spans the whole run rather than only its first fragment.
with grouped as (
  select
    id,
    first_value(id) over w as keep_id,
    finished_at,
    outcome,
    row_number() over (
      partition by tenant_id, scope_id, task_id, agent_session_run_id, role
      order by finished_at desc nulls first, created_at desc
    ) as ending_rank
  from module_tasks.task_runs
  window w as (
    partition by tenant_id, scope_id, task_id, agent_session_run_id, role
    order by created_at asc
  )
),
ending as (
  select keep_id, finished_at, outcome from grouped where ending_rank = 1
)
update module_tasks.task_runs as runs
set finished_at = ending.finished_at,
    outcome = ending.outcome
from ending
where runs.id = ending.keep_id
  and (runs.finished_at is distinct from ending.finished_at
    or runs.outcome is distinct from ending.outcome);

-- The superseded fragments. Deleting them is the point of the migration: they
-- are duplicate bookkeeping for a run that is fully represented by the row kept
-- above, and nothing references task_runs.id.
delete from module_tasks.task_runs as runs
using (
  select
    id,
    first_value(id) over (
      partition by tenant_id, scope_id, task_id, agent_session_run_id, role
      order by created_at asc
    ) as keep_id
  from module_tasks.task_runs
) as dupes
where runs.id = dupes.id
  and dupes.id <> dupes.keep_id;

create unique index if not exists uniq_module_tasks_task_runs_per_run
  on module_tasks.task_runs (
    tenant_id, scope_id, task_id, agent_session_run_id, role
  );
