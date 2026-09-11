-- Space deletion: mark as deleted, then purge after a grace period.
--
-- The UI never issues a hard DELETE. An admin marks the space; it vanishes from
-- every list and URL immediately (`deleted_at`). A background sweep calls
-- `core.purge_space` once `purge_after` has passed, which removes the row and
-- the space-owned records that `on delete restrict` would otherwise refuse.
--
-- The Company space (`is_default`) and personal spaces (`owner_user_id`) cannot
-- be marked. Keys stay reserved until the hard purge so a replacement cannot
-- collide with a space that is still draining.
--
-- Idempotent: guarded adds, drop-policy-first, create-or-replace function.

alter table core.spaces
  add column if not exists deleted_at timestamptz,
  add column if not exists purge_after timestamptz;

alter table core.spaces drop constraint if exists spaces_deleted_purge_pair_check;
alter table core.spaces
  add constraint spaces_deleted_purge_pair_check
  check (
    (deleted_at is null and purge_after is null)
    or (deleted_at is not null and purge_after is not null)
  );

create index if not exists spaces_purge_due_idx
  on core.spaces (purge_after)
  where deleted_at is not null;

-- Browser lane: a marked space is gone. The server lane keeps seeing the row
-- so the mark, restore, and purge paths can still find it.
drop policy if exists spaces_select_own_tenant on core.spaces;
create policy spaces_select_own_tenant on core.spaces
  as permissive for select to authenticated
  using (
    tenant_id = (select core.current_tenant_id())
    and deleted_at is null
    and (
      visibility = 'open'
      or owner_user_id = (select core.current_user_id())
      or exists (
        select 1 from core.space_member m
        where m.space_id = spaces.id
          and m.user_id = (select core.current_user_id())
      )
    )
  );

-- Delete rows from a module table that may not exist on a partial install.
-- Quoted identifiers only — never interpolate caller text into the statement.
create or replace function core.delete_space_owned_rows(
  p_schema text,
  p_table text,
  p_space_id uuid,
  p_tenant_id uuid
)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if to_regclass(format('%I.%I', p_schema, p_table)) is null then
    return;
  end if;
  execute format(
    'delete from %I.%I where space_id = $1 and tenant_id = $2',
    p_schema,
    p_table
  ) using p_space_id, p_tenant_id;
end
$$;

revoke all on function core.delete_space_owned_rows(text, text, uuid, uuid) from public;
grant execute on function core.delete_space_owned_rows(text, text, uuid, uuid) to engenty_server;
grant execute on function core.delete_space_owned_rows(text, text, uuid, uuid) to service_role;

-- Hard-delete one already-marked space and the records it owns.
-- Callers must have marked it first; a live or default space is refused.
create or replace function core.purge_space(p_space_id uuid, p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if not exists (
    select 1 from core.spaces
    where id = p_space_id
      and tenant_id = p_tenant_id
      and deleted_at is not null
      and is_default = false
  ) then
    raise exception 'space_purge_refused'
      using errcode = 'check_violation';
  end if;

  -- Space-owned module rows. Order: work items that point at containers first.
  perform core.delete_space_owned_rows('module_tasks', 'triggers', p_space_id, p_tenant_id);
  perform core.delete_space_owned_rows('module_tasks', 'task_templates', p_space_id, p_tenant_id);
  perform core.delete_space_owned_rows('module_tasks', 'tasks', p_space_id, p_tenant_id);
  perform core.delete_space_owned_rows('module_tasks', 'goals', p_space_id, p_tenant_id);
  perform core.delete_space_owned_rows('module_kb', 'knowledge_bases', p_space_id, p_tenant_id);

  -- File manager rows have no space_id FK; they key off owner_type/owner_id.
  if to_regclass('module_files.file_entries') is not null then
    delete from module_files.file_entries
    where tenant_id = p_tenant_id
      and owner_type = 'space'
      and owner_id = p_space_id::text;
    if to_regclass('module_projects.projects') is not null then
      delete from module_files.file_entries e
      using module_projects.projects p
      where e.tenant_id = p_tenant_id
        and e.owner_type = 'project'
        and e.owner_id = p.id::text
        and p.tenant_id = p_tenant_id
        and p.space_id = p_space_id;
    end if;
  end if;
  if to_regclass('module_files.file_folders') is not null then
    delete from module_files.file_folders
    where tenant_id = p_tenant_id
      and owner_type = 'space'
      and owner_id = p_space_id::text;
    if to_regclass('module_projects.projects') is not null then
      delete from module_files.file_folders f
      using module_projects.projects p
      where f.tenant_id = p_tenant_id
        and f.owner_type = 'project'
        and f.owner_id = p.id::text
        and p.tenant_id = p_tenant_id
        and p.space_id = p_space_id;
    end if;
  end if;

  perform core.delete_space_owned_rows('module_projects', 'projects', p_space_id, p_tenant_id);

  -- Visibility columns that SET NULL on space delete — we want the data gone.
  if to_regclass('ai.thread') is not null then
    delete from ai.thread
    where space_id = p_space_id and tenant_id = p_tenant_id;
  end if;
  if to_regclass('ai.routines') is not null then
    delete from ai.routines
    where space_id = p_space_id and tenant_id = p_tenant_id;
  end if;
  if to_regclass('ai.artifact') is not null then
    delete from ai.artifact
    where tenant_id = p_tenant_id
      and scope_type = 'space'
      and scope_id = p_space_id::text;
  end if;
  if to_regclass('search.documents') is not null then
    delete from search.documents
    where space_id = p_space_id and tenant_id = p_tenant_id;
  end if;

  delete from core.spaces
  where id = p_space_id and tenant_id = p_tenant_id;
end
$$;

revoke all on function core.purge_space(uuid, uuid) from public;
grant execute on function core.purge_space(uuid, uuid) to engenty_server;
grant execute on function core.purge_space(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
