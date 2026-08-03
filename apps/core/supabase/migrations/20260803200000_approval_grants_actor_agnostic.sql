-- D2 phase 2c: actor- and module-agnostic approval grants.
--
-- A task approval ("this task may create the PR") is decided before anyone
-- knows which agent principal the retried run will execute as — the same
-- reality agent_goal_grants models with a nullable agent_id. actor_id NULL
-- now means "whoever does the granted subject's work".
--
-- module_id NULL means the grant names only the operation: operation ids are
-- globally unique (core invokes by operation id alone), so the module adds
-- provenance, not precision — and the task UI's approval act has no module in
-- hand. The check constraint keeps any agnostic grant bound to a subject,
-- because agnostic AND subject-free would be a tenant-wide blank check.

alter table core.approval_grants
  alter column actor_id drop not null;

alter table core.approval_grants
  alter column module_id drop not null;

alter table core.approval_grants
  add constraint approval_grants_agnostic_needs_subject
  check (
    (actor_id is not null and module_id is not null)
    or subject_id is not null
  );

notify pgrst, 'reload schema';
