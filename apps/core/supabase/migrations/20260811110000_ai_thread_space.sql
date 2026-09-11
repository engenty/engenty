-- A chat belongs to a space (PLAN-spaces.md Phase C2).
--
-- VISIBILITY, not security. This column answers "which space's history is this
-- thread in"; it is NOT an authorization input. What an agent may reach is
-- still decided by the capability system and the space mount set (§1c), and
-- Phase C3a is where the thread's space starts feeding tool narrowing — that
-- step must validate the space against the caller's accessible set before
-- trusting it, because the value arrives from the client's route context.
--
-- NULLABLE and staying that way. A null reads as "pre-space": the thread was
-- created before this column existed and shows only under "All spaces". Every
-- NEW thread writes one. Making it `not null` would mean inventing a space for
-- rows whose real answer is "we don't know", which is the state the backfill
-- below only partially resolves.

alter table ai.thread
  add column if not exists space_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'thread_space_tenant_fkey'
      and conrelid = 'ai.thread'::regclass
  ) then
    -- COMPOSITE (space_id, tenant_id), the same trap-avoidance as space_mount
    -- and space_member: a plain reference to core.spaces(id) would accept
    -- another tenant's space, and apps/ai reaches this table on a lane where
    -- RLS enforces the tenant wall but cannot re-derive it per column.
    --
    -- `set null (space_id)` — the column list is load-bearing, NOT decoration.
    -- A bare `on delete set null` on a COMPOSITE foreign key nulls EVERY
    -- column in it, tenant_id included; the KB migration hit exactly this and
    -- the failure named the wrong table. A tenant-less row in a codebase whose
    -- whole isolation model is "every row has a tenant_id" is the real danger,
    -- so it is spelled out here rather than inherited. (Postgres 15+.)
    alter table ai.thread
      add constraint thread_space_tenant_fkey
      foreign key (space_id, tenant_id) references core.spaces (id, tenant_id)
      on delete set null (space_id);
  end if;
end
$$;

-- The list filter is always tenant + space, never space alone.
create index if not exists thread_tenant_space_idx
  on ai.thread (tenant_id, space_id);

-- Backfill, per the Phase C decision:
--   a human's threads  → that person's PERSONAL space (the cross-space copilot
--                        lives there, so that is where an unplaced chat belongs)
--   service threads    → the tenant default (they have no person to follow)
-- A human with no personal space yet — a row predating the Phase P backfill —
-- keeps null rather than being pushed into the default space, where it would
-- appear in a colleague's Company history.
update ai.thread as t
set space_id = s.id
from core.spaces as s
where t.space_id is null
  and t.created_by_user_id is not null
  and s.tenant_id = t.tenant_id
  and s.owner_user_id = t.created_by_user_id;

update ai.thread as t
set space_id = s.id
from core.spaces as s
where t.space_id is null
  and t.created_by_user_id is null
  and s.tenant_id = t.tenant_id
  and s.is_default;

-- The RPC has to learn the column, and that is a REPLACEMENT, not an addition.
-- Adding a parameter creates an OVERLOAD: PostgREST calls by named arguments,
-- so a request that omits p_space_id would match both signatures — ambiguous at
-- best, silently the space-less one at worst. `search.query_chunks` hit this in
-- Phase P4. The old signature is dropped below, in this same migration.
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
  p_workspace_key text,
  p_space_id uuid
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
    workspace_key,
    space_id
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
    p_workspace_key,
    p_space_id
  )
  on conflict (id) do update set
    tenant_id = excluded.tenant_id,
    agent_id = excluded.agent_id,
    created_by_user_id = excluded.created_by_user_id,
    title = excluded.title,
    metadata = excluded.metadata,
    route_context = excluded.route_context,
    status = excluded.status,
    summary = excluded.summary,
    workspace_key = excluded.workspace_key,
    -- COALESCE, unlike every sibling above: this upsert is also the idempotent
    -- re-save path, and a re-save that omits the space must not erase the one
    -- the thread already has. The siblings are always supplied; the space is
    -- not (a pre-space client, a service path that resolves none).
    space_id = coalesce(excluded.space_id, ai.thread.space_id)
  returning * into v_thread;

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

drop function if exists ai.upsert_thread_with_owner(
  uuid, text, uuid, uuid, text, jsonb, jsonb, text, text, text
);

-- Recreating a function drops its ACL with it, so both grants are restated
-- rather than assumed: service_role from 20260806120000, and engenty_server
-- from 20260809260000 — apps/ai runs on tenant-locked handles, which ARE
-- engenty_server, and without this grant creating a chat fails outright with
-- `agent_threads.createFailed`. Still SECURITY INVOKER: every statement inside
-- is evaluated against the caller's policies, so this makes the function
-- reachable, never privileged. anon/authenticated stay ungranted — the browser
-- lane reaches threads through core.
revoke all on function ai.upsert_thread_with_owner(
  uuid, text, uuid, uuid, text, jsonb, jsonb, text, text, text, uuid
) from public;

grant execute on function ai.upsert_thread_with_owner(
  uuid, text, uuid, uuid, text, jsonb, jsonb, text, text, text, uuid
) to service_role;

grant execute on function ai.upsert_thread_with_owner(
  uuid, text, uuid, uuid, text, jsonb, jsonb, text, text, text, uuid
) to engenty_server;

-- The function above REPLACED a signature PostgREST had cached; until the
-- cache reloads, every RPC call carrying p_space_id answers PGRST202 and
-- chat creation fails — the exact failure mode the grant comment above
-- documents. Every sibling migration in this set carries the reload; this
-- one dropped it.
notify pgrst, 'reload schema';
