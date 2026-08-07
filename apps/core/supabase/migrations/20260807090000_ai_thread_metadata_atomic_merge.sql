-- Merge a single key into ai.thread.metadata inside ONE statement.
--
-- The DAL used to read the thread row, fold one key into the metadata object
-- in JS, then write the WHOLE blob back. Read and write are separate
-- transactions, so any metadata write that commits in between is silently
-- reverted by the write — a lost update, not a merge.
--
-- The window is real and hit in practice. Mastra's own `saveThread` rewrites
-- this column (agent state-signal tracking lives at metadata.mastra), the HITL
-- lane writes ag_ui_open_interrupt, and tool-approval grants write their own
-- keys. A show_artifact PATCH landing across any of those reverts them.
--
-- `||` is a shallow top-level merge evaluated against the CURRENT row, so
-- concurrent writers to *other* keys survive. Deletion is expressed as
-- p_remove_keys rather than a null value, because `'{"k":null}'::jsonb` merges
-- a JSON null rather than dropping the key.
--
-- INVOKER (not SECURITY DEFINER) on purpose, matching
-- 20260806120000_ai_thread_owner_atomic: this changes write ATOMICITY, never
-- write AUTHORITY. thread_update applies exactly as before.
create or replace function ai.merge_thread_metadata(
  p_tenant_id uuid,
  p_thread_id uuid,
  p_user_id uuid,
  p_patch jsonb,
  p_remove_keys text[]
-- `setof` (exactly one row) so PostgREST answers with a one-element array,
-- which supabase-js `.single()` expects. Zero rows when the caller does not
-- own the thread — the DAL maps that to a not-found, same as before.
) returns setof ai.thread
language sql
set search_path = ''
as $$
  update ai.thread
  set metadata =
    (coalesce(metadata, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb))
    - coalesce(p_remove_keys, array[]::text[])
  where tenant_id = p_tenant_id
    and id = p_thread_id
    and created_by_user_id = p_user_id
  returning *;
$$;

revoke all on function ai.merge_thread_metadata(
  uuid, uuid, uuid, jsonb, text[]
) from public;

grant execute on function ai.merge_thread_metadata(
  uuid, uuid, uuid, jsonb, text[]
) to service_role;
