-- A task comment has a KIND, instead of a leading emoji that means something.
--
-- Comments are the task's output channel: a person's note, an agent's progress
-- report, a run's result, a question that blocks the run, and lifecycle notices
-- the system writes. The code told those apart by string prefix — the result
-- lookup literally ran `content like '🤖%'`, and "is a question open" matched a
-- leading '❓'. That is typing user-visible text: reword the copy, translate it,
-- or let a person paste an emoji, and the meaning moves.
--
-- The kinds:
--   note      a person wrote it (the default, and what a plain insert means)
--   progress  an agent reporting mid-run via task_comment
--   question  an agent asked and STOPPED; the task waits for an answer
--   result    the run's outcome, written by the write-result step
--   system    lifecycle notices nobody typed (flow gated / failed / waiting)
--
-- Default is 'note' so every existing caller and any future plain insert stays
-- correct without naming a kind.

alter table module_tasks.task_comments
  add column if not exists kind text not null default 'note';

alter table module_tasks.task_comments
  drop constraint if exists task_comments_kind_check;

alter table module_tasks.task_comments
  add constraint task_comments_kind_check
  check (kind in ('note', 'progress', 'question', 'result', 'system'));

-- Backfill from the prefixes the code used to key on, newest rules last so the
-- most specific wins. Order matters: a result comment is agent-authored too, so
-- the broad "agent wrote it -> progress" rule has to run FIRST and be narrowed
-- by the specific ones after it.
update module_tasks.task_comments
  set kind = 'progress'
  where created_by_agent_type_key is not null;

update module_tasks.task_comments
  set kind = 'result'
  where created_by_agent_type_key is not null
    and content like '🤖%';

update module_tasks.task_comments
  set kind = 'question'
  where created_by_agent_type_key is not null
    and content like '❓%';

-- The mirror's own notices and the paused-run comment: authored by no agent
-- key (the mirror invokes without one) or carrying the pause marker.
update module_tasks.task_comments
  set kind = 'system'
  where content like '⏸%'
     or content like 'Flow completed%'
     or content like 'Flow failed%'
     or content like 'Flow is waiting%';

-- "Does this task have an unanswered question?" is asked per task, newest
-- first — the same shape as the existing comments index but narrowed, so it
-- stays cheap on tasks with long threads.
create index if not exists idx_module_tasks_comments_kind
  on module_tasks.task_comments (task_id, kind, created_at desc);

comment on column module_tasks.task_comments.kind is
  'What this comment IS: note (person) | progress (agent, mid-run) | question (agent asked, run stopped) | result (run outcome) | system (lifecycle notice). Replaces emoji-prefix typing.';
