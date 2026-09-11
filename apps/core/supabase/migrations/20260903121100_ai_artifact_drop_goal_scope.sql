-- Tasks Goals are gone. Artifact rows scoped to a Goal have no product
-- container left. Re-home them to their origin thread when one exists, else
-- to space (scope_id stays the old goal uuid — orphaned but listable). Then
-- drop `goal` from the CHECKs so nothing new can write that scope.
--
-- `core.agent_goal_grants` and approval_grants.scope = 'goal' are a different
-- noun (capability subject) and stay.

do $$
begin
  if to_regclass('ai.artifact') is null then
    return;
  end if;

  update ai.artifact
  set
    scope_type = case
      when thread_id is not null then 'thread'
      else 'space'
    end,
    scope_id = case
      when thread_id is not null then thread_id::text
      else scope_id
    end
  where scope_type = 'goal';

  alter table ai.artifact drop constraint if exists artifact_scope_type_check;
  alter table ai.artifact add constraint artifact_scope_type_check
    check (scope_type in ('thread', 'task', 'project', 'space'));

  if to_regclass('ai.artifact_storage_binding') is not null then
    delete from ai.artifact_storage_binding where scope_type = 'goal';
    alter table ai.artifact_storage_binding
      drop constraint if exists artifact_storage_binding_scope_type_check;
    alter table ai.artifact_storage_binding
      add constraint artifact_storage_binding_scope_type_check
      check (scope_type in ('task', 'project', 'space'));
  end if;
end
$$;
