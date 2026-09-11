-- Rooms have members (PLAN-agent-rooms.md R1).
--
-- A thread used to name exactly one agent (`ai.thread.agent_id`) and any
-- number of people (`ai.thread_participant`). Two agents sharing a room had to
-- be smuggled in through `route_context.agent_pair`, and a room with three
-- could not exist. This table is the agents' side of membership; people keep
-- `thread_participant` (its principal is a uuid, an agent id is not).
--
-- `ai.thread.agent_id` stays as the room's HOST: the desk that lists it first,
-- the memory owner for shared observational memory, the agent that answers
-- when nobody is addressed. The host is also a member row, role `host`, so
-- "rooms this agent is in" is one query.

create table if not exists ai.thread_agent (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  thread_id uuid not null references ai.thread(id) on delete cascade,
  agent_id text not null,
  role text not null default 'member'
    constraint thread_agent_role_check check (role in ('host', 'member')),
  created_at timestamptz not null default now(),
  primary key (thread_id, agent_id)
);

create index if not exists thread_agent_agent_idx
  on ai.thread_agent (tenant_id, agent_id);

alter table ai.thread_agent enable row level security;

-- Server lane: the standard tenant wall.
grant select, insert, update, delete on ai.thread_agent to engenty_server;
grant select, insert, update, delete on ai.thread_agent to service_role;

drop policy if exists srv_tenant_isolation on ai.thread_agent;
create policy srv_tenant_isolation on ai.thread_agent
  as permissive for all to engenty_server
  using (tenant_id = (select core.current_tenant_id()))
  with check (tenant_id = (select core.current_tenant_id()));

-- Browser lane: a person reads the members of a room they are in — the same
-- rule thread_participant already applies to itself.
grant select on ai.thread_agent to authenticated;

drop policy if exists thread_agent_select on ai.thread_agent;
create policy thread_agent_select on ai.thread_agent for select
  to authenticated
  using (
    tenant_id = core.current_tenant_id()
    and ai.is_thread_member(thread_id, tenant_id)
  );

-- Every existing thread's agent is its host.
insert into ai.thread_agent (tenant_id, thread_id, agent_id, role)
select t.tenant_id, t.id, t.agent_id, 'host'
from ai.thread t
where t.agent_id is not null and t.agent_id <> ''
on conflict (thread_id, agent_id) do nothing;

-- Pair rooms: the second agent becomes a member, and the marker that carried
-- it goes — membership is the record now, nothing reads the key any more.
insert into ai.thread_agent (tenant_id, thread_id, agent_id, role)
select t.tenant_id, t.id, pair.agent_id, 'member'
from ai.thread t
cross join lateral jsonb_array_elements_text(t.route_context -> 'agent_pair') as pair(agent_id)
where jsonb_typeof(t.route_context -> 'agent_pair') = 'array'
  and pair.agent_id <> t.agent_id
on conflict (thread_id, agent_id) do nothing;

update ai.thread
set route_context = route_context - 'agent_pair'
where route_context ? 'agent_pair';

-- The upsert RPC writes the host row with the thread, in the same transaction
-- the owner participant lands in — a room without its host is the same gap
-- the participant row closed in 20260806120000. Replacement, not addition:
-- same signature, so no overload.
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

  if p_agent_id is not null and p_agent_id <> '' then
    insert into ai.thread_agent (tenant_id, thread_id, agent_id, role)
    values (p_tenant_id, v_thread.id, p_agent_id, 'host')
    on conflict (thread_id, agent_id) do update set role = 'host';
  end if;

  return next v_thread;
  return;
end;
$$;

-- Recreating a function drops its ACL with it (see 20260811110000).
revoke all on function ai.upsert_thread_with_owner(
  uuid, text, uuid, uuid, text, jsonb, jsonb, text, text, text, uuid
) from public;
grant execute on function ai.upsert_thread_with_owner(
  uuid, text, uuid, uuid, text, jsonb, jsonb, text, text, text, uuid
) to service_role;
grant execute on function ai.upsert_thread_with_owner(
  uuid, text, uuid, uuid, text, jsonb, jsonb, text, text, text, uuid
) to engenty_server;

comment on table ai.thread_agent is
  'The agents in a room. The thread''s agent_id is its host and also a row here (role host); every other agent that may speak in the room is a member.';

-- A replaced signature is a PostgREST cache miss until reload (20260811110000).
notify pgrst, 'reload schema';
