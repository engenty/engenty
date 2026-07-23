-- Durable record of an unanswered tool-approval request.
--
-- A paused run used to advertise itself only through an inbox notification, so
-- dismissing that notification without deciding left the task blocked with no
-- way back: the approval UI keyed off the notification and vanished with it.
-- The request belongs to the task, not to a dismissible message about it.
--
-- Written on release (needs_approval outcome), cleared when the operation is
-- approved or when a new run checks the task out. A denial deliberately leaves
-- the entry in place — "denied" means not yet, and the human keeps the option
-- to approve later.
-- Column grants inherit from the schema-wide grants in the base migration.

alter table module_tasks.tasks
  add column if not exists pending_approval_operation_ids text[] not null
    default '{}';
