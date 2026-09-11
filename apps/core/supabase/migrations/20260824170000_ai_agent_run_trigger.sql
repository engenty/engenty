-- How a run actually started.
--
-- `ai.agent_run` never recorded this, so the run API filled the field with the
-- constant "message" — every run in an agent's Runs tab claimed a person had
-- typed something, including the ones a schedule fired at 07:00 with nobody
-- watching. That is the one question the tab exists to answer, so it gets a
-- column rather than a plausible default.
--
-- The vocabulary matches what the readers already declare:
--   message  — someone typed in a chat
--   command  — a slash command
--   button   — an action button
--   cron     — a schedule fired (a routine waking its standing task)
--   hook     — an event subscription
--   direct   — an API/tool dispatch with no human at the keyboard
--
-- Nullable on purpose: rows written before this column cannot be attributed
-- after the fact, and inventing "message" for them is the bug this fixes.
-- Readers show an unknown trigger as unknown.
alter table ai.agent_run
  add column if not exists trigger text;

alter table ai.agent_run
  drop constraint if exists agent_run_trigger_check;

alter table ai.agent_run
  add constraint agent_run_trigger_check
  check (
    trigger is null
    or trigger in ('message', 'command', 'button', 'cron', 'hook', 'direct')
  );

comment on column ai.agent_run.trigger is
  'How the run started: message | command | button | cron | hook | direct. Null = unknown (rows predating the column); readers must not substitute a default.';
