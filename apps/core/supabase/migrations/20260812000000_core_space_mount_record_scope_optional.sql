-- `record_scope` becomes optional, because nothing decides it yet.
--
-- The column was introduced as required on every module mount, and every writer
-- filled it with 'space'. That value was never read — no query, no policy, no
-- agent assembler consults it — and for most modules it is false: contacts,
-- invoices, offers and time-tracking are ONE tenant-wide book that a space
-- borrows, not a per-space set of records. There is no `space_id` on any of
-- their tables to scope by.
--
-- Two different questions were sitting in one column:
--
--   * "Can this module's records be space-scoped at all?" — a fact about the
--     module's schema, knowable from the module, not something to store once
--     per space.
--   * "Should this space's view of them be narrowed?" — a real per-space
--     choice, and the one the column is for. That feature (module objects as
--     virtual folders in the data tree) is not designed yet.
--
-- So the column stays and stops being written. NULL now means "undecided",
-- which is the truth, and the first reader to arrive will not find 400 rows
-- claiming a decision nobody made. `agent_access` is untouched and still
-- required on a module mount — that one IS read, and carries authorization.
--
-- Safe as a plain relaxation: spaces are unreleased, so no install has rows
-- here beyond local development.

-- Dropped BEFORE the backfill, not after: the old constraint demands a non-null
-- record_scope on every module mount, so clearing the column first fails on the
-- table's own existing rows.
alter table core.space_mount
  drop constraint if exists space_mount_module_config_check;

-- Existing module mounts carry the value the old writers invented. It was never
-- a decision, so it is cleared rather than migrated — leaving it would preserve
-- exactly the false claim this migration exists to stop making. Nothing reads
-- the column, so this changes no behaviour.
update core.space_mount
set record_scope = null
where resource_type = 'module';

-- `agent_access` keeps its `is not null` half for the reason the original
-- comment gives: `null in ('none','read','write')` is NULL, and a CHECK only
-- rejects FALSE, so without it a module mount that simply omits the column
-- would be accepted. `record_scope` is now allowed to be absent, but when it IS
-- present it must still be one of the two known values.
alter table core.space_mount
  add constraint space_mount_module_config_check check (
    resource_type <> 'module'
    or (
      agent_access is not null
      and agent_access in ('none', 'read', 'write')
      and (record_scope is null or record_scope in ('space', 'all'))
    )
  );

comment on column core.space_mount.record_scope is
  'Reserved: per-space narrowing of a mounted module''s records. NULL = undecided, which is every row today. Write it only once something reads it.';

-- The baseline seeded 'space' for the chat module along with everything else.
-- Replaceable function, so this is the whole change.
create or replace function core.space_baseline_mounts()
returns table (
  resource_type text,
  resource_key text,
  record_scope text,
  agent_access text
)
language sql
immutable
as $$
  -- Chat: a mounted app like any other, not a special case in the schema.
  -- `none` because the copilot module holds no records of its own — the chat
  -- agent's reach comes from the OTHER modules mounted in the space.
  select 'module'::text, 'engenty-copilot'::text, null::text, 'none'::text
  union all
  select 'agent'::text, 'engenty.copilot'::text, null::text, null::text
  union all
  select 'agent'::text, 'engenty.coordinator'::text, null::text, null::text
$$;

grant execute on function core.space_baseline_mounts() to engenty_server, authenticated, service_role;
