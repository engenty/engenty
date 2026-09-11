-- Artifacts can be kept with an Engenty (`scope_type = 'agent'`,
-- `scope_id` = the agent id). Same store path as task, project, and space.
-- Ablage still lists only space-scoped rows; the desk lists agent-scoped ones.

do $$
begin
  if to_regclass('ai.artifact') is null then
    return;
  end if;

  alter table ai.artifact drop constraint if exists artifact_scope_type_check;
  alter table ai.artifact add constraint artifact_scope_type_check
    check (scope_type in ('thread', 'task', 'project', 'space', 'agent'));

  if to_regclass('ai.artifact_storage_binding') is not null then
    alter table ai.artifact_storage_binding
      drop constraint if exists artifact_storage_binding_scope_type_check;
    alter table ai.artifact_storage_binding
      add constraint artifact_storage_binding_scope_type_check
      check (scope_type in ('task', 'project', 'space', 'agent'));
  end if;
end
$$;
