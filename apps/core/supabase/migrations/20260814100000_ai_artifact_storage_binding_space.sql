-- A space can bind artifact storage, like every other scope
-- (PLAN-space-data.md D6).
--
-- `ai.artifact` learned the `space` scope in 20260810000000_core_spaces.sql,
-- but `ai.artifact_storage_binding` — which says WHERE a scope's promoted
-- artifacts are mirrored to — was left behind with the original three. The gap
-- is only visible when someone tries to bind storage for a space and the insert
-- fails a check constraint that has no reason to exclude it: a space is simply
-- the widest scope below the tenant, and its artifacts mirror the same way a
-- project's do.
alter table ai.artifact_storage_binding
  drop constraint if exists artifact_storage_binding_scope_type_check;

alter table ai.artifact_storage_binding
  add constraint artifact_storage_binding_scope_type_check
  check (scope_type in ('task', 'project', 'goal', 'space'));

notify pgrst, 'reload schema';
