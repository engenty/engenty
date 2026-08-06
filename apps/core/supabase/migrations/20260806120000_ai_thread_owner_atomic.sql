-- Write a thread and its owner participant row in ONE transaction.
--
-- The DAL used to do two PostgREST calls: insert ai.thread, then insert the
-- ai.thread_participant owner row. Each call is its own transaction, so the
-- thread row was briefly committed with no participant.
--
-- That gap is visible to Supabase Realtime. WALRUS evaluates thread_select as
-- the SUBSCRIBER's role (see 20260705150000_ai_thread_participant_rls_recursion),
-- and thread_select requires an ai.thread_participant row for the subscriber.
-- A thread INSERT processed inside the gap fails the check and is dropped for
-- every other window — a new chat silently never appears in a second tab.
-- App writes go through service_role and bypass RLS, so nothing surfaced here
-- except the missing realtime event.
--
-- Committing both rows at one LSN closes it deterministically: by the time
-- WALRUS evaluates the thread record, the participant row is committed too.
--
-- INVOKER (not SECURITY DEFINER) on purpose — thread_insert and
-- thread_participant_insert must keep applying exactly as they do today. This
-- function changes write ATOMICITY, never write AUTHORITY.
create or replace function ai.upsert_thread_with_owner(
  p_tenant_id uuid,
  p_agent_id text,
  p_created_by_user_id uuid,
  p_id uuid,
  p_title text,
  p_metadata jsonb,
  p_route_context jsonb,
  p_status text,
  p_summary text,
  p_workspace_key text
-- `setof` (returning exactly one row) rather than a bare composite: PostgREST
-- then answers with a one-element array, which is what supabase-js `.single()`
-- expects.
) returns setof ai.thread
language plpgsql
set search_path = ''
as $$
declare
  v_thread ai.thread;
begin
  insert into ai.thread (
    id,
    tenant_id,
    agent_id,
    created_by_user_id,
    title,
    metadata,
    route_context,
    status,
    summary,
    workspace_key
  )
  values (
    coalesce(p_id, public.uuidv7()),
    p_tenant_id,
    p_agent_id,
    p_created_by_user_id,
    p_title,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_route_context, '{}'::jsonb),
    coalesce(p_status, 'idle'),
    p_summary,
    p_workspace_key
  )
  on conflict (id) do update set
    -- Mirrors what the PostgREST upsert sent: every supplied column, and
    -- NOT updated_at (no trigger maintains it on ai.thread, and bumping it
    -- here would reorder the sidebar on every idempotent re-save).
    tenant_id = excluded.tenant_id,
    agent_id = excluded.agent_id,
    created_by_user_id = excluded.created_by_user_id,
    title = excluded.title,
    metadata = excluded.metadata,
    route_context = excluded.route_context,
    status = excluded.status,
    summary = excluded.summary,
    workspace_key = excluded.workspace_key
  returning * into v_thread;

  -- A service-created thread has no human owner; the participant row's
  -- principal types only cover users and groups, so it gets none.
  if p_created_by_user_id is not null then
    insert into ai.thread_participant (
      tenant_id,
      thread_id,
      principal_type,
      principal_id,
      role
    )
    values (
      p_tenant_id,
      v_thread.id,
      'user'::ai.session_principal_type,
      p_created_by_user_id,
      'owner'::ai.session_participant_role
    )
    on conflict (thread_id, principal_type, principal_id) do update set
      role = excluded.role;
  end if;

  return next v_thread;
  return;
end;
$$;

revoke all on function ai.upsert_thread_with_owner(
  uuid, text, uuid, uuid, text, jsonb, jsonb, text, text, text
) from public;

grant execute on function ai.upsert_thread_with_owner(
  uuid, text, uuid, uuid, text, jsonb, jsonb, text, text, text
) to service_role;
