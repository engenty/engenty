-- initial_schema: consolidated baseline.
-- Replaces 121 migration(s) (00000000000001..20260911120000),
-- dumped from a database with the full history applied. Existing databases
-- have this version marked applied and never run it; it is the fresh-install
-- path only.
-- Extensions are database-wide, so the core baseline owns all of them: pgmq
-- for queues, pgcrypto for gen_random_uuid, pg_trgm for the trigram indexes,
-- vector for the retrieval embeddings the modules index into.
-- Roles are cluster-global, so `pg_dump` never emits them and the consolidation
-- dropped the two statements that used to live in
-- 20260809200000_core_engenty_server_lane.sql. Every policy below grants to
-- engenty_server, so without this a fresh database fails on the first one with
-- `role "engenty_server" does not exist`; existing databases already have the
-- role and have this baseline marked applied.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'engenty_server') then
    create role engenty_server nologin nobypassrls noinherit;
  end if;
end
$$;

-- PostgREST switches to the role named in the JWT `role` claim, which requires
-- the authenticator role to be a member.
grant engenty_server to authenticator;

create extension if not exists pgcrypto;
create extension if not exists pgmq;
create extension if not exists pg_trgm with schema public;
create extension if not exists vector with schema public;

SET check_function_bodies = false;

--
-- Name: ai; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA ai;

--
-- Name: core; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA core;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

--
-- Name: agent_run_status; Type: TYPE; Schema: ai; Owner: -
--

CREATE TYPE ai.agent_run_status AS ENUM (
    'running',
    'completed',
    'failed',
    'cancelled',
    'interrupted',
    'requires_action',
    'paused',
    'sleeping'
);

--
-- Name: session_message_role; Type: TYPE; Schema: ai; Owner: -
--

CREATE TYPE ai.session_message_role AS ENUM (
    'system',
    'user',
    'assistant',
    'tool',
    'signal'
);

--
-- Name: session_participant_role; Type: TYPE; Schema: ai; Owner: -
--

CREATE TYPE ai.session_participant_role AS ENUM (
    'owner',
    'member',
    'viewer'
);

--
-- Name: session_principal_type; Type: TYPE; Schema: ai; Owner: -
--

CREATE TYPE ai.session_principal_type AS ENUM (
    'user',
    'group'
);

--
-- Name: bump_thread_updated_at(); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.bump_thread_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update ai.thread
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

--
-- Name: bump_usage_period_total(uuid, uuid, timestamp with time zone, timestamp with time zone, bigint, bigint, bigint, bigint, bigint, text, timestamp with time zone, bigint); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.bump_usage_period_total(p_tenant_id uuid, p_user_id uuid, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_input_tokens bigint, p_output_tokens bigint, p_cached_tokens bigint, p_reasoning_tokens bigint, p_cost_micros bigint, p_currency text, p_occurred_at timestamp with time zone, p_compute_ms bigint DEFAULT 0) RETURNS void
    LANGUAGE sql
    AS $$
  insert into ai.usage_period_total (
    tenant_id,
    user_id,
    period_start,
    period_end,
    input_tokens,
    output_tokens,
    cached_tokens,
    reasoning_tokens,
    compute_ms,
    cost_micros,
    currency,
    event_count,
    last_event_at,
    updated_at
  )
  values (
    p_tenant_id,
    p_user_id,
    p_period_start,
    p_period_end,
    p_input_tokens,
    p_output_tokens,
    p_cached_tokens,
    p_reasoning_tokens,
    p_compute_ms,
    p_cost_micros,
    p_currency,
    1,
    p_occurred_at,
    now()
  )
  on conflict (tenant_id, user_id, period_start)
  do update set
    period_end = excluded.period_end,
    input_tokens = ai.usage_period_total.input_tokens + excluded.input_tokens,
    output_tokens = ai.usage_period_total.output_tokens + excluded.output_tokens,
    cached_tokens = ai.usage_period_total.cached_tokens + excluded.cached_tokens,
    reasoning_tokens = ai.usage_period_total.reasoning_tokens + excluded.reasoning_tokens,
    compute_ms = ai.usage_period_total.compute_ms + excluded.compute_ms,
    cost_micros = ai.usage_period_total.cost_micros + excluded.cost_micros,
    currency = excluded.currency,
    event_count = ai.usage_period_total.event_count + 1,
    last_event_at = greatest(
      coalesce(ai.usage_period_total.last_event_at, '-infinity'::timestamptz),
      excluded.last_event_at
    ),
    updated_at = now();
$$;

--
-- Name: is_thread_member(uuid, uuid); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.is_thread_member(p_thread_id uuid, p_tenant_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from ai.thread_participant p
    where p.thread_id = p_thread_id
      and p.tenant_id = p_tenant_id
      and p.principal_type = 'user'::ai.session_principal_type
      and p.principal_id = (auth.jwt() ->> 'sub')::uuid
  );
$$;

--
-- Name: uuidv7(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.uuidv7(v_timestamp timestamp with time zone DEFAULT clock_timestamp()) RETURNS uuid
    LANGUAGE sql PARALLEL SAFE
    AS $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send((extract(epoch from v_timestamp) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52,
        1
      ),
      53,
      1
    ),
    'hex'
  )::uuid;
$$;

--
-- Name: thread; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.thread (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    agent_id text NOT NULL,
    created_by_user_id uuid,
    title text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    route_context jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'idle'::text NOT NULL,
    summary text,
    workspace_key text,
    space_id uuid,
    visibility text DEFAULT 'space'::text NOT NULL,
    CONSTRAINT agent_session_agent_id_len CHECK ((char_length(agent_id) <= 128)),
    CONSTRAINT agent_session_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'running'::text, 'waiting'::text, 'failed'::text, 'completed'::text]))),
    CONSTRAINT agent_session_summary_len CHECK (((summary IS NULL) OR (char_length(summary) <= 2000))),
    CONSTRAINT agent_session_title_len CHECK (((title IS NULL) OR (char_length(title) <= 512))),
    CONSTRAINT agent_session_workspace_key_len CHECK (((workspace_key IS NULL) OR (char_length(workspace_key) <= 256))),
    CONSTRAINT thread_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'space'::text])))
);

--
-- Name: COLUMN thread.visibility; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.thread.visibility IS 'space: anyone who may enter the thread''s Space reads and posts (a shared specialist''s desk). private: only the people in ai.thread_participant and the room''s agents.';

--
-- Name: merge_thread_metadata(uuid, uuid, uuid, jsonb, text[], jsonb); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.merge_thread_metadata(p_tenant_id uuid, p_thread_id uuid, p_user_id uuid, p_patch jsonb, p_remove_keys text[], p_append_sets jsonb) RETURNS SETOF ai.thread
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  update ai.thread
  set metadata = (
    select
      (
        coalesce(metadata, '{}'::jsonb)
        || coalesce(p_patch, '{}'::jsonb)
        || coalesce(
             (
               select jsonb_object_agg(
                 appended.key,
                 appended.merged
               )
               from (
                 select
                   entry.key as key,
                   (
                     select jsonb_agg(distinct value_element)
                     from jsonb_array_elements(
                       coalesce(
                         case
                           when jsonb_typeof(coalesce(metadata, '{}'::jsonb) -> entry.key) = 'array'
                             then coalesce(metadata, '{}'::jsonb) -> entry.key
                           else '[]'::jsonb
                         end,
                         '[]'::jsonb
                       ) || entry.value
                     ) as value_element
                   ) as merged
                 from jsonb_each(coalesce(p_append_sets, '{}'::jsonb)) as entry
               ) as appended
             ),
             '{}'::jsonb
           )
      ) - coalesce(p_remove_keys, array[]::text[])
  )
  where tenant_id = p_tenant_id
    and id = p_thread_id
  returning *;
$$;

--
-- Name: upsert_thread_with_owner(uuid, text, uuid, uuid, text, jsonb, jsonb, text, text, text, uuid); Type: FUNCTION; Schema: ai; Owner: -
--

CREATE FUNCTION ai.upsert_thread_with_owner(p_tenant_id uuid, p_agent_id text, p_created_by_user_id uuid, p_id uuid, p_title text, p_metadata jsonb, p_route_context jsonb, p_status text, p_summary text, p_workspace_key text, p_space_id uuid) RETURNS SETOF ai.thread
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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

--
-- Name: current_jwt(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.current_jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

--
-- Name: current_tenant_id(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.current_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select nullif(core.current_jwt() ->> 'tenant_id', '')::uuid
$$;

--
-- Name: current_user_id(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select nullif(core.current_jwt() ->> 'sub', '')::uuid
$$;

--
-- Name: custom_access_token_hook(jsonb); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.custom_access_token_hook(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'core', 'public'
    AS $$
declare
  claims jsonb;
  user_id uuid;
  tenant_id uuid;
begin
  user_id := coalesce(
    nullif(event ->> 'user_id', '')::uuid,
    nullif(event -> 'claims' ->> 'sub', '')::uuid
  );

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if user_id is not null then
    select u.tenant_id
      into tenant_id
      from core.users u
     where u.id = user_id
     limit 1;

    if tenant_id is not null then
      claims := jsonb_set(claims, '{tenant_id}', to_jsonb(tenant_id::text));
      claims := jsonb_set(claims, '{scopes}', '["default"]'::jsonb);
    end if;
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

--
-- Name: delete_space_owned_rows(text, text, uuid, uuid); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.delete_space_owned_rows(p_schema text, p_table text, p_space_id uuid, p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'core', 'public'
    AS $_$
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
$_$;

--
-- Name: deployment_self_check(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.deployment_self_check() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object(
    'hook_function_exists', exists (
      select 1
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'core'
         and p.proname = 'custom_access_token_hook'
    ),
    'hook_executable_by_auth', coalesce(
      (
        select pg_catalog.has_function_privilege(
          'supabase_auth_admin',
          p.oid,
          'EXECUTE'
        )
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'core'
           and p.proname = 'custom_access_token_hook'
         limit 1
      ),
      false
    ),
    'auth_can_use_core_schema',
      pg_catalog.has_schema_privilege('supabase_auth_admin', 'core', 'USAGE'),
    'auth_can_read_users',
      pg_catalog.has_table_privilege(
        'supabase_auth_admin', 'core.users', 'SELECT'
      ),
    'auth_can_read_tenant_settings',
      pg_catalog.has_table_privilege(
        'supabase_auth_admin', 'core.tenant_settings', 'SELECT'
      ),
    'schemas', coalesce(
      (
        select pg_catalog.jsonb_agg(n.nspname order by n.nspname)
          from pg_catalog.pg_namespace n
         where n.nspname not like 'pg\_%'
           and n.nspname <> 'information_schema'
      ),
      '[]'::jsonb
    ),
    'applied_migrations', (
      select pg_catalog.count(*) from supabase_migrations.schema_migrations
    ),
    'latest_migration', (
      select pg_catalog.max(version) from supabase_migrations.schema_migrations
    )
  );
$$;

--
-- Name: ensure_default_space(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.ensure_default_space() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'core', 'public'
    AS $$
declare
  v_space_id uuid;
begin
  insert into core.spaces (tenant_id, key, name, is_default)
  values (new.id, 'company', 'Company', true)
  on conflict do nothing
  returning id into v_space_id;
  if v_space_id is not null then
    insert into core.space_mount (
      tenant_id, space_id, resource_type, resource_key,
      record_scope, agent_access, is_required
    )
    values (new.id, v_space_id, 'module', 'tasks', null, 'write', false)
    on conflict (tenant_id, space_id, resource_type, resource_key) do nothing;
  end if;
  return new;
end
$$;

--
-- Name: ensure_personal_space(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.ensure_personal_space() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'core', 'public'
    AS $$
declare
  v_space_id uuid;
  v_default_space_id uuid;
  v_name text;
begin
  select id into v_space_id
  from core.spaces
  where tenant_id = new.tenant_id and owner_user_id = new.user_id;

  if v_space_id is null then
    select coalesce(nullif(u.display_name, ''), split_part(u.email, '@', 1))
      into v_name
    from core.users u where u.id = new.user_id;

    insert into core.spaces (tenant_id, key, name, visibility, owner_user_id)
    values (
      new.tenant_id,
      core.personal_space_key(new.tenant_id, new.user_id),
      coalesce(nullif(v_name, ''), 'Personal'),
      'private',
      new.user_id
    )
    returning id into v_space_id;
  end if;

  -- Deliberately NO membership row for the personal space: `owner_user_id` is
  -- the entire access grant, and a roster of one would invite a roster of two.

  -- Membership in the tenant's default (Company) space stays — that one IS
  -- shared, and it is what keeps a brand-new user's rail from being empty.
  select id into v_default_space_id
  from core.spaces where tenant_id = new.tenant_id and is_default;

  if v_default_space_id is not null then
    insert into core.space_member (tenant_id, space_id, user_id, role)
    values (new.tenant_id, v_default_space_id, new.user_id, 'member')
    on conflict do nothing;
  end if;

  return new;
end
$$;

--
-- Name: forbid_personal_space_member(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.forbid_personal_space_member() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'core', 'public'
    AS $$
begin
  if exists (
    select 1 from core.spaces s
    where s.id = new.space_id and s.owner_user_id is not null
  ) then
    raise exception
      'space % is personal; personal spaces have no members'
      , new.space_id
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

--
-- Name: has_scope(text); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.has_scope(p_scope_id text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (
    select 1
    from jsonb_array_elements_text(coalesce(core.current_jwt() -> 'scopes', '[]'::jsonb)) as s(scope_id)
    where s.scope_id = p_scope_id
  )
$$;

--
-- Name: orphan_personal_space_on_leave(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.orphan_personal_space_on_leave() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'core', 'public'
    AS $$
begin
  -- Order matters: nulling the owner first is what lets the membership delete below
  -- past core.protect_space_owner_member().
  update core.spaces
     set owner_user_id = null
   where tenant_id = old.tenant_id and owner_user_id = old.user_id;

  delete from core.space_member
   where tenant_id = old.tenant_id and user_id = old.user_id;

  return old;
end
$$;

--
-- Name: personal_space_key(uuid, uuid); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.personal_space_key(p_tenant_id uuid, p_user_id uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'core', 'public'
    AS $_$
declare
  v_base text;
  v_key text;
  v_n integer := 1;
begin
  select lower(split_part(u.email, '@', 1)) into v_base
  from core.users u where u.id = p_user_id;

  v_base := regexp_replace(coalesce(v_base, ''), '[^a-z0-9]+', '-', 'g');
  v_base := regexp_replace(v_base, '(^-+|-+$)', '', 'g');
  v_base := left(v_base, 50);
  if v_base = '' or v_base !~ '^[a-z0-9]' then
    v_base := 'me';
  end if;

  v_key := v_base;
  -- Matches spaces_tenant_key_uniq, which is on lower(key).
  while exists (
    select 1 from core.spaces
    where tenant_id = p_tenant_id and lower(key) = lower(v_key)
  ) loop
    v_n := v_n + 1;
    v_key := left(v_base, 50) || '-' || v_n::text;
  end loop;

  return v_key;
end
$_$;

--
-- Name: purge_space(uuid, uuid); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.purge_space(p_space_id uuid, p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'core', 'public'
    AS $$
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

--
-- Name: seed_space_baseline_mounts(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.seed_space_baseline_mounts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'core', 'public'
    AS $$
begin
  -- SECURITY DEFINER: this fires inside tenant creation too, where the server
  -- lane's `core.current_tenant_id()` is not yet set and the RLS write policy on
  -- space_mount would refuse the insert.
  insert into core.space_mount (
    tenant_id, space_id, resource_type, resource_key,
    record_scope, agent_access, is_required
  )
  select new.tenant_id, new.id, b.resource_type, b.resource_key,
         b.record_scope, b.agent_access, true
  from core.space_baseline_mounts() b
  on conflict (tenant_id, space_id, resource_type, resource_key) do nothing;
  return new;
end
$$;

--
-- Name: space_baseline_mounts(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.space_baseline_mounts() RETURNS TABLE(resource_type text, resource_key text, record_scope text, agent_access text)
    LANGUAGE sql IMMUTABLE
    AS $$
  select 'module'::text, 'engenty-copilot'::text, null::text, 'none'::text
  union all
  select 'module'::text, 'files'::text, null::text, 'write'::text
  union all
  select 'module'::text, 'connections'::text, null::text, 'write'::text
  union all
  select 'agent'::text, 'engenty.copilot'::text, null::text, null::text
  union all
  select 'agent'::text, 'engenty.cli'::text, null::text, null::text
  union all
  select 'agent'::text, 'engenty.file-analyst'::text, null::text, null::text
$$;

--
-- Name: FUNCTION space_baseline_mounts(); Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON FUNCTION core.space_baseline_mounts() IS 'PLAN-spaces.md 3b: mounts every space is seeded with and may not remove. Mirrored by SPACE_BASELINE_MOUNTS in packages/plugin-sdk/src/space-setup.ts and pinned by space-setup.test.ts.';

--
-- Name: module_invoices_count_invoices_by_client_ids(uuid, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.module_invoices_count_invoices_by_client_ids(p_tenant_id uuid, p_scope_id text, p_client_ids text[]) RETURNS TABLE(client_id text, invoice_count bigint)
    LANGUAGE sql STABLE
    AS $$
  select u.cid, coalesce(agg.cnt, 0)::bigint as invoice_count
  from unnest(p_client_ids) as u(cid)
  left join (
    select inv.client_id, count(*)::bigint as cnt
    from module_invoices.invoices inv
    where inv.tenant_id = p_tenant_id
      and inv.scope_id = p_scope_id
      and inv.deleted_at is null
    group by inv.client_id
  ) agg on agg.client_id = u.cid;
$$;

--
-- Name: pgmq_archive(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_archive(queue text, msg_id bigint) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT pgmq.archive(queue, msg_id);
$$;

--
-- Name: pgmq_delete(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_delete(queue text, msg_id bigint) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT pgmq.delete(queue, msg_id);
$$;

--
-- Name: pgmq_list_queues(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_list_queues() RETURNS TABLE(queue_name text, created_at timestamp with time zone, queue_length bigint, newest_msg_age interval)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  q RECORD;
  tbl text;
  cnt bigint;
  age interval;
BEGIN
  FOR q IN SELECT m.queue_name AS qn, m.created_at AS ca FROM pgmq.meta m ORDER BY m.queue_name
  LOOP
    tbl := 'pgmq.q_' || q.qn;
    EXECUTE format('SELECT count(*) FROM %s', tbl) INTO cnt;
    EXECUTE format('SELECT now() - max(enqueued_at) FROM %s', tbl) INTO age;
    queue_name := q.qn;
    created_at := q.ca;
    queue_length := cnt;
    newest_msg_age := age;
    RETURN NEXT;
  END LOOP;
END;
$$;

--
-- Name: pgmq_metrics(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_metrics(queue_name text) RETURNS TABLE(queue_length bigint, oldest_msg_age_sec integer)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pgmq', 'public'
    AS $$
  SELECT
    m.queue_length,
    m.oldest_msg_age_sec
  FROM pgmq.metrics(queue_name) AS m;
$$;

--
-- Name: pgmq_peek(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_peek(queue text, n integer DEFAULT 10) RETURNS SETOF pgmq.message_record
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT * FROM pgmq.read(queue, 0, n);
$$;

--
-- Name: pgmq_pop(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_pop(queue text) RETURNS SETOF pgmq.message_record
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT * FROM pgmq.pop(queue);
$$;

--
-- Name: pgmq_read(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_read(queue text, vt integer, n integer) RETURNS SETOF pgmq.message_record
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT * FROM pgmq.read(queue, vt, n);
$$;

--
-- Name: pgmq_send(text, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_send(queue text, msg jsonb, delay_sec integer DEFAULT 0) RETURNS bigint
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT pgmq.send(queue, msg, delay_sec);
$$;

--
-- Name: pgmq_send_batch(text, jsonb[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_send_batch(queue text, msgs jsonb[], delay_sec integer DEFAULT 0) RETURNS SETOF bigint
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT pgmq.send_batch(queue, msgs, delay_sec);
$$;

--
-- Name: agent_run; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.agent_run (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    agent_id text NOT NULL,
    model_id text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    prompt_tokens integer,
    completion_tokens integer,
    mastra_trace_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    status ai.agent_run_status DEFAULT 'running'::ai.agent_run_status NOT NULL,
    error_code text,
    error_message text,
    cancelled_at timestamp with time zone,
    created_by_user_id uuid,
    context_prompt_tokens bigint,
    trigger text,
    CONSTRAINT agent_run_trigger_check CHECK (((trigger IS NULL) OR (trigger = ANY (ARRAY['message'::text, 'command'::text, 'button'::text, 'cron'::text, 'hook'::text, 'direct'::text, 'task'::text]))))
);

--
-- Name: COLUMN agent_run.context_prompt_tokens; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.agent_run.context_prompt_tokens IS 'Input tokens of the run''s LAST step — context-window occupancy at the end of the run. Null = unknown; readers fall back to prompt_tokens (which is the sum across all steps).';

--
-- Name: COLUMN agent_run.trigger; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.agent_run.trigger IS 'How the run started: message | command | button | cron | hook | direct | task. Null = unknown (rows predating the column); readers must not substitute a default.';

--
-- Name: agent_run_event; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.agent_run_event (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    run_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    seq bigint NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: artifact; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.artifact (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    scope_type text NOT NULL,
    scope_id text NOT NULL,
    thread_id uuid,
    created_by_kind text NOT NULL,
    created_by uuid,
    current_version integer DEFAULT 1 NOT NULL,
    storage text DEFAULT 'inline'::text NOT NULL,
    storage_key text,
    storage_connection_id uuid,
    mime_type text,
    size_bytes bigint,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_id uuid,
    CONSTRAINT artifact_created_by_kind_check CHECK ((created_by_kind = ANY (ARRAY['agent'::text, 'user'::text]))),
    CONSTRAINT artifact_scope_type_check CHECK ((scope_type = ANY (ARRAY['thread'::text, 'task'::text, 'project'::text, 'space'::text, 'agent'::text]))),
    CONSTRAINT artifact_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text]))),
    CONSTRAINT artifact_storage_check CHECK ((storage = ANY (ARRAY['inline'::text, 'blob'::text])))
);

ALTER TABLE ONLY ai.artifact REPLICA IDENTITY FULL;

--
-- Name: artifact_storage_binding; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.artifact_storage_binding (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    scope_type text NOT NULL,
    scope_id text NOT NULL,
    connection_id uuid NOT NULL,
    folder_ref text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT artifact_storage_binding_scope_type_check CHECK ((scope_type = ANY (ARRAY['task'::text, 'project'::text, 'space'::text, 'agent'::text])))
);

--
-- Name: artifact_version; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.artifact_version (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    artifact_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    version integer NOT NULL,
    content text,
    storage_key text,
    summary text,
    created_by_kind text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT artifact_version_created_by_kind_check CHECK ((created_by_kind = ANY (ARRAY['agent'::text, 'user'::text])))
);

--
-- Name: data_table; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.data_table (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    space_id uuid NOT NULL,
    title text NOT NULL,
    columns jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY ai.data_table REPLICA IDENTITY FULL;

--
-- Name: data_table_row; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.data_table_row (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    table_id uuid NOT NULL,
    cells jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY ai.data_table_row REPLICA IDENTITY FULL;

--
-- Name: engenty_ai_agents; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.engenty_ai_agents (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    agent_id text NOT NULL,
    name text NOT NULL,
    description text,
    model text NOT NULL,
    instructions text NOT NULL,
    tool_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    skill_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    sub_agents jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    guardrails jsonb DEFAULT '{}'::jsonb NOT NULL,
    core_agent_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    proposed_config jsonb,
    created_by_agent text,
    limits jsonb DEFAULT '{}'::jsonb NOT NULL,
    model_override text,
    purpose text,
    agent_scope text DEFAULT 'shared'::text NOT NULL,
    proposed_space_id uuid,
    engenty text,
    starters jsonb DEFAULT '[]'::jsonb NOT NULL,
    sandbox jsonb,
    module_id text,
    kind text DEFAULT 'specialist'::text NOT NULL,
    effort text,
    CONSTRAINT engenty_ai_agents_agent_scope_check CHECK ((agent_scope = ANY (ARRAY['personal'::text, 'shared'::text]))),
    CONSTRAINT engenty_ai_agents_effort_check CHECK (((effort IS NULL) OR (effort = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))),
    CONSTRAINT engenty_ai_agents_kind_check CHECK ((kind = ANY (ARRAY['interface'::text, 'specialist'::text, 'delegated'::text, 'chat_surface'::text]))),
    CONSTRAINT engenty_ai_agents_purpose_check CHECK (((purpose IS NULL) OR (purpose = ANY (ARRAY['chat'::text, 'routing'::text, 'research'::text, 'planning_coding'::text, 'safeguard'::text])))),
    CONSTRAINT engenty_ai_agents_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'active'::text, 'archived'::text])))
);

--
-- Name: COLUMN engenty_ai_agents.sandbox; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.engenty_ai_agents.sandbox IS 'Sandbox slice of the agent workspace declaration (lifecycle, network tier, timeout). Null = platform default. `requireApproval` is not honoured from here: unattended execution comes from an approval grant, never from an agent describing itself.';

--
-- Name: engenty_ai_tools; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.engenty_ai_tools (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    tool_id text NOT NULL,
    name text NOT NULL,
    description text,
    schema_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    endpoint_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: engenty_instruction_changes; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.engenty_instruction_changes (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    instruction_doc_id uuid NOT NULL,
    proposed_by_run_id uuid,
    approved_by_user_id uuid,
    approved_at timestamp with time zone,
    status text DEFAULT 'applied'::text NOT NULL,
    previous_body text,
    next_body text NOT NULL,
    change_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engenty_instruction_changes_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'rejected'::text, 'applied'::text])))
);

--
-- Name: engenty_instruction_overrides; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.engenty_instruction_overrides (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid,
    module_id text NOT NULL,
    document_key text NOT NULL,
    layer text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    created_by_user_id uuid,
    updated_by_user_id uuid,
    source_kind text DEFAULT 'user'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engenty_instruction_overrides_layer_check CHECK ((layer = ANY (ARRAY['tenant_override'::text, 'user_override'::text]))),
    CONSTRAINT engenty_instruction_overrides_source_kind_check CHECK ((source_kind = ANY (ARRAY['seed'::text, 'user'::text, 'agent_proposal'::text, 'agent_approved'::text])))
);

--
-- Name: gateway_model_sync_run; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.gateway_model_sync_run (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    trigger text NOT NULL,
    status text NOT NULL,
    model_count integer DEFAULT 0 NOT NULL,
    updated_model_count integer DEFAULT 0 NOT NULL,
    inserted_pricing_count integer DEFAULT 0 NOT NULL,
    error_text text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gateway_model_sync_run_status_check CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text]))),
    CONSTRAINT gateway_model_sync_run_trigger_check CHECK ((trigger = ANY (ARRAY['manual'::text, 'scheduled'::text])))
);

--
-- Name: gateway_model_sync_settings; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.gateway_model_sync_settings (
    id text DEFAULT 'default'::text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    scheduler_mode text DEFAULT 'app_interval'::text NOT NULL,
    cron_expression text DEFAULT '0 3 * * *'::text NOT NULL,
    interval_ms integer DEFAULT 86400000 NOT NULL,
    target_url text,
    last_run_at timestamp with time zone,
    last_success_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gateway_model_sync_settings_interval_check CHECK ((interval_ms >= 60000)),
    CONSTRAINT gateway_model_sync_settings_mode_check CHECK ((scheduler_mode = ANY (ARRAY['app_interval'::text, 'supabase_cron'::text]))),
    CONSTRAINT gateway_model_sync_settings_singleton_check CHECK ((id = 'default'::text))
);

--
-- Name: TABLE gateway_model_sync_settings; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON TABLE ai.gateway_model_sync_settings IS 'Controls apps/ai Gateway model sync scheduling. Supabase cron HTTP jobs are not installed here because committed migrations must not contain bearer tokens or service secrets.';

--
-- Name: model; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.model (
    model_id text NOT NULL,
    display_name text,
    description text,
    provider text NOT NULL,
    providers text[] DEFAULT '{}'::text[] NOT NULL,
    type text,
    use_cases text[] DEFAULT '{}'::text[] NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    context_tokens bigint,
    max_output_tokens bigint,
    input_per_mtok_micros bigint,
    output_per_mtok_micros bigint,
    cached_input_per_mtok_micros bigint,
    web_search_per_query_micros bigint,
    capabilities jsonb DEFAULT '{}'::jsonb NOT NULL,
    zdr_supported boolean,
    no_training_supported boolean,
    released_at timestamp with time zone,
    source_url text DEFAULT 'https://ai-gateway.vercel.sh/v1/models'::text NOT NULL,
    raw_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    price_tier text,
    available_for_chat boolean DEFAULT false NOT NULL,
    available_for_routing boolean DEFAULT false NOT NULL,
    available_for_embedding boolean DEFAULT false NOT NULL,
    available_for_image boolean DEFAULT false NOT NULL,
    available_for_video boolean DEFAULT false NOT NULL,
    available_for_rerank boolean DEFAULT false NOT NULL,
    gateway text DEFAULT 'vercel'::text NOT NULL,
    CONSTRAINT model_price_tier_check CHECK (((price_tier IS NULL) OR (price_tier = ANY (ARRAY['cheap'::text, 'low'::text, 'medium'::text, 'high'::text, 'expensive'::text])))),
    CONSTRAINT model_use_cases_check CHECK ((use_cases <@ ARRAY['text'::text, 'code'::text, 'image'::text, 'video'::text, 'embed'::text, 'rerank'::text]))
);

--
-- Name: TABLE model; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON TABLE ai.model IS 'Model catalog, one row per (gateway, model). Synced from each registered gateway adapter in apps/ai; availability flags are operator state and survive syncs.';

--
-- Name: COLUMN model.gateway; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.model.gateway IS 'Which gateway serves this row (vercel, and later openrouter or a direct vendor API). Never part of model_id: the id names the model, this names the route.';

--
-- Name: model_binding; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.model_binding (
    scope text DEFAULT 'platform'::text NOT NULL,
    role text NOT NULL,
    model_id text NOT NULL,
    gateway text DEFAULT 'vercel'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT model_binding_model_check CHECK ((model_id <> ''::text)),
    CONSTRAINT model_binding_role_check CHECK ((role <> ''::text)),
    CONSTRAINT model_binding_scope_check CHECK ((scope = ANY (ARRAY['platform'::text, 'tenant'::text])))
);

--
-- Name: TABLE model_binding; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON TABLE ai.model_binding IS 'Role -> model bindings. Seeded at boot from authored defaults (and, once, from the legacy AI_*_MODEL env vars) so an upgrade preserves behaviour. Superadmin-editable thereafter.';

--
-- Name: model_pricing; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.model_pricing (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    model_id text NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    input_per_mtok_micros bigint DEFAULT 0 NOT NULL,
    output_per_mtok_micros bigint DEFAULT 0 NOT NULL,
    cached_input_per_mtok_micros bigint DEFAULT 0 NOT NULL,
    reasoning_per_mtok_micros bigint DEFAULT 0 NOT NULL,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_to timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: push_subscriptions; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.push_subscriptions (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);

--
-- Name: routine_triggers; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.routine_triggers (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    routine_id uuid NOT NULL,
    kind text NOT NULL,
    cron text,
    timezone text,
    provider_id text,
    resource text,
    event_filter jsonb,
    input_mapping jsonb,
    webhook_secret text,
    shortcode text,
    schedule_id text,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT routine_triggers_kind_check CHECK ((kind = ANY (ARRAY['schedule'::text, 'event'::text, 'manual'::text, 'agent'::text]))),
    CONSTRAINT routine_triggers_schedule_needs_cron CHECK (((kind <> 'schedule'::text) OR (cron IS NOT NULL)))
);

--
-- Name: TABLE routine_triggers; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON TABLE ai.routine_triggers IS 'One wake source of a routine. A routine has 1..n; a fire is allowed only when routine and trigger are both enabled.';

--
-- Name: COLUMN routine_triggers.shortcode; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.routine_triggers.shortcode IS 'Manual kind: a short key a person can invoke the routine by.';

--
-- Name: COLUMN routine_triggers.schedule_id; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.routine_triggers.schedule_id IS 'Derived Mastra schedule id (schedule kind only). Reconciled by apps/ai; never a second source of truth.';

--
-- Name: routines; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.routines (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    space_id uuid,
    agent_id text NOT NULL,
    name text NOT NULL,
    description text,
    source text DEFAULT 'custom'::text NOT NULL,
    module_id text,
    declaration_id text,
    workflow_id uuid NOT NULL,
    workflow_input jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    quiet_hours text,
    approval_grants text[] DEFAULT '{}'::text[] NOT NULL,
    report text DEFAULT 'desk_card'::text NOT NULL,
    outcome text,
    created_by_user_id uuid,
    last_fired_at timestamp with time zone,
    last_result text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT routines_report_check CHECK ((report = ANY (ARRAY['quiet'::text, 'desk_card'::text, 'ask'::text]))),
    CONSTRAINT routines_source_check CHECK ((source = ANY (ARRAY['custom'::text, 'module'::text])))
);

--
-- Name: TABLE routines; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON TABLE ai.routines IS 'A job on a mounted specialist: an action to run plus a wake source. Each fire starts a Run (ai.action_request), never a Task.';

--
-- Name: COLUMN routines.workflow_input; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.routines.workflow_input IS 'Static input handed to the targeted workflow at fire.';

--
-- Name: COLUMN routines.approval_grants; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.routines.approval_grants IS 'Operations an unattended fire may call without parking for approval.';

--
-- Name: COLUMN routines.outcome; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.routines.outcome IS 'What the routine promises to do — not what a run did. That is the run summary.';

--
-- Name: COLUMN routines.created_by_user_id; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.routines.created_by_user_id IS 'Whose Space surface an unattended fire resolves as. The fire itself acts as the AI service principal.';

--
-- Name: tenant_usage_policy; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.tenant_usage_policy (
    tenant_id uuid NOT NULL,
    tier text DEFAULT 'free'::text NOT NULL,
    period_mode text DEFAULT 'calendar'::text NOT NULL,
    period_unit text DEFAULT 'month'::text NOT NULL,
    period_anchor timestamp with time zone,
    included_input_tokens bigint,
    included_output_tokens bigint,
    included_cost_micros bigint,
    hard_limit_cost_micros bigint,
    soft_limit_cost_micros bigint,
    allowed_models text[],
    enforcement_mode text DEFAULT 'observe'::text NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    managed_by text DEFAULT 'tenant'::text NOT NULL,
    allowed_providers text[],
    allowed_efforts text[],
    CONSTRAINT tenant_usage_policy_enforcement_mode_check CHECK ((enforcement_mode = ANY (ARRAY['observe'::text, 'enforce'::text]))),
    CONSTRAINT tenant_usage_policy_managed_by_check CHECK ((managed_by = ANY (ARRAY['tenant'::text, 'entitlement'::text]))),
    CONSTRAINT tenant_usage_policy_period_mode_check CHECK ((period_mode = ANY (ARRAY['calendar'::text, 'rolling'::text]))),
    CONSTRAINT tenant_usage_policy_period_unit_check CHECK ((period_unit = ANY (ARRAY['day'::text, 'week'::text, 'month'::text])))
);

--
-- Name: COLUMN tenant_usage_policy.allowed_providers; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.tenant_usage_policy.allowed_providers IS 'Provider allow-list matched against ai.gateway_model.provider. NULL/empty = unrestricted. Additive with allowed_models: a model is permitted if it matches either list.';

--
-- Name: COLUMN tenant_usage_policy.allowed_efforts; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.tenant_usage_policy.allowed_efforts IS 'Licensed effort tiers (low/medium/high). NULL/empty = all. Requests above the ceiling degrade to the highest granted tier rather than failing.';

--
-- Name: thread_agent; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.thread_agent (
    tenant_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    agent_id text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT thread_agent_role_check CHECK ((role = ANY (ARRAY['host'::text, 'member'::text])))
);

--
-- Name: TABLE thread_agent; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON TABLE ai.thread_agent IS 'The agents in a room. The thread''s agent_id is its host and also a row here (role host); every other agent that may speak in the room is a member.';

--
-- Name: thread_message; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.thread_message (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    role ai.session_message_role NOT NULL,
    parts jsonb NOT NULL,
    author_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT agent_session_message_parts_object CHECK ((jsonb_typeof(parts) = ANY (ARRAY['object'::text, 'array'::text])))
);

--
-- Name: COLUMN thread_message.metadata; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.thread_message.metadata IS 'Mastra message metadata (content.metadata) — carries state-signal identity and provider metadata. Preserved verbatim by EngentySessionMemoryStorage; author_user_id is projected on read and is not stored here.';

--
-- Name: thread_participant; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.thread_participant (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    principal_type ai.session_principal_type NOT NULL,
    principal_id uuid NOT NULL,
    role ai.session_participant_role DEFAULT 'member'::ai.session_participant_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: usage_event; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.usage_event (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid,
    user_id uuid,
    run_id uuid,
    thread_id uuid,
    request_id uuid,
    agent_id text,
    action_id text,
    feature text NOT NULL,
    model_id text NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    cached_tokens bigint DEFAULT 0 NOT NULL,
    reasoning_tokens bigint DEFAULT 0 NOT NULL,
    pricing_version_id uuid,
    input_per_mtok_micros bigint DEFAULT 0 NOT NULL,
    output_per_mtok_micros bigint DEFAULT 0 NOT NULL,
    cached_input_per_mtok_micros bigint DEFAULT 0 NOT NULL,
    reasoning_per_mtok_micros bigint DEFAULT 0 NOT NULL,
    cost_micros bigint DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    compute_ms bigint DEFAULT 0 NOT NULL,
    space_id uuid
);

--
-- Name: usage_period_total; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.usage_period_total (
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    cached_tokens bigint DEFAULT 0 NOT NULL,
    reasoning_tokens bigint DEFAULT 0 NOT NULL,
    cost_micros bigint DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    event_count bigint DEFAULT 0 NOT NULL,
    last_event_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    compute_ms bigint DEFAULT 0 NOT NULL
);

--
-- Name: user_usage_policy; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.user_usage_policy (
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    max_cost_micros bigint,
    max_total_tokens bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: workflow; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.workflow (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    module_id text,
    name text NOT NULL,
    description text,
    context_type text,
    current_version integer,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_workflow_id text,
    owner_agent_id text,
    title text,
    CONSTRAINT workflow_active_needs_version CHECK (((status <> 'active'::text) OR (current_version IS NOT NULL))),
    CONSTRAINT workflow_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'disabled'::text])))
);

--
-- Name: TABLE workflow; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON TABLE ai.workflow IS 'Published workflow definitions (Mastra graph + tenant sugar).';

--
-- Name: COLUMN workflow.source_workflow_id; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.workflow.source_workflow_id IS 'Module workflow id this row reconciles from; null on an authored workflow.';

--
-- Name: workflow_run; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.workflow_run (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid,
    thread_id uuid,
    trigger text NOT NULL,
    workflow_id text,
    agent_id text,
    status text DEFAULT 'requested'::text NOT NULL,
    reason text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    run_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    context_type text,
    context_id text,
    workflow_version_id uuid,
    wake_at timestamp with time zone,
    owner_task_id uuid,
    owner_task_mode text DEFAULT 'primary'::text NOT NULL,
    routine_id uuid,
    summary text,
    outcome text,
    reporting text,
    CONSTRAINT workflow_run_outcome_check CHECK ((outcome = ANY (ARRAY['ok'::text, 'nothing_to_do'::text, 'partial'::text, 'needs_attention'::text, 'rejected'::text, 'failed'::text]))),
    CONSTRAINT workflow_run_owner_task_mode_check CHECK ((owner_task_mode = ANY (ARRAY['primary'::text, 'nested'::text]))),
    CONSTRAINT workflow_run_reporting_check CHECK ((reporting = ANY (ARRAY['silent'::text, 'info'::text, 'verbose'::text]))),
    CONSTRAINT workflow_run_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'coalesced'::text, 'skipped'::text, 'claimed'::text, 'converted_to_run'::text, 'cancelled'::text, 'dispatched'::text, 'completed'::text, 'failed'::text, 'requires_action'::text, 'paused'::text, 'sleeping'::text]))),
    CONSTRAINT workflow_run_trigger_check CHECK ((trigger = ANY (ARRAY['message'::text, 'command'::text, 'button'::text, 'cron'::text, 'hook'::text, 'direct'::text, 'task'::text])))
);

--
-- Name: TABLE workflow_run; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON TABLE ai.workflow_run IS 'Invocation audit / dedup row for a workflow run. Distinct from ai.agent_run (engine execution).';

--
-- Name: COLUMN workflow_run.workflow_version_id; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.workflow_run.workflow_version_id IS 'Pins a graph run to the exact immutable version it started on.';

--
-- Name: COLUMN workflow_run.wake_at; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.workflow_run.wake_at IS 'When a sleeping run is due to resume (sleep / sleepUntil nodes).';

--
-- Name: COLUMN workflow_run.owner_task_id; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.workflow_run.owner_task_id IS 'Task supervising this flow run (Variant D). Null for button/agent-started runs.';

--
-- Name: COLUMN workflow_run.owner_task_mode; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.workflow_run.owner_task_mode IS 'primary: the Task body is this flow; nested: invoke_action reused an agent Task.';

--
-- Name: COLUMN workflow_run.routine_id; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.workflow_run.routine_id IS 'The routine whose fire started this run. Null for presses, chat, and task-subject runs. Overlap is decided on this column.';

--
-- Name: COLUMN workflow_run.summary; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.workflow_run.summary IS 'One-line result for the desk card. Distinct from reason, which explains a failure.';

--
-- Name: COLUMN workflow_run.outcome; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.workflow_run.outcome IS 'The flow''s own verdict on the work, from its declared output. Independent of status: outcome=failed on status=completed is a business failure, not a crash.';

--
-- Name: COLUMN workflow_run.reporting; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.workflow_run.reporting IS 'How loudly this run''s result lands in the owner''s chat. Overrides the routine''s report knob when present.';

--
-- Name: workflow_version; Type: TABLE; Schema: ai; Owner: -
--

CREATE TABLE ai.workflow_version (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    workflow_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    version integer NOT NULL,
    graph jsonb NOT NULL,
    input_schema jsonb DEFAULT '{}'::jsonb NOT NULL,
    output_schema jsonb DEFAULT '{}'::jsonb NOT NULL,
    allowed_tools text[],
    authored_by text DEFAULT 'user'::text NOT NULL,
    created_by_user_id uuid,
    approved_by_user_id uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflow_version_authored_by_check CHECK ((authored_by = ANY (ARRAY['user'::text, 'copilot'::text, 'system'::text])))
);

--
-- Name: TABLE workflow_version; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON TABLE ai.workflow_version IS 'Immutable workflow versions. A run pins a version id.';

--
-- Name: COLUMN workflow_version.graph; Type: COMMENT; Schema: ai; Owner: -
--

COMMENT ON COLUMN ai.workflow_version.graph IS 'Mastra StoredWorkflowGraph JSON (core >=1.56): { id, inputSchema, outputSchema, graph }.';

--
-- Name: agent_goal_grants; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.agent_goal_grants (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    goal_id text NOT NULL,
    agent_id uuid,
    capability text NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);

--
-- Name: agents; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.agents (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: api_tokens; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.api_tokens (
    id uuid NOT NULL,
    name text NOT NULL,
    principal_id text NOT NULL,
    tenant_id uuid,
    principal_type text DEFAULT 'agent'::text NOT NULL,
    token_hash text NOT NULL,
    last4 text,
    capabilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    module_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    scopes jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT api_tokens_principal_type_check CHECK ((principal_type = ANY (ARRAY['agent'::text, 'service'::text])))
);

--
-- Name: approval_grants; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.approval_grants (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    request_id uuid,
    actor_id text,
    module_id text,
    operation_id text NOT NULL,
    scope text NOT NULL,
    subject_id text,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT approval_grants_agnostic_needs_subject CHECK ((((actor_id IS NOT NULL) AND (module_id IS NOT NULL)) OR (subject_id IS NOT NULL))),
    CONSTRAINT approval_grants_scope_check CHECK ((scope = ANY (ARRAY['once'::text, 'session'::text, 'policy'::text, 'task'::text, 'trigger'::text, 'goal'::text])))
);

--
-- Name: approval_requests; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.approval_requests (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    actor_id text NOT NULL,
    module_id text NOT NULL,
    operation_id text NOT NULL,
    reason text NOT NULL,
    context jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    decision text,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT approval_requests_decision_check CHECK ((decision = ANY (ARRAY['allow_once'::text, 'allow_session'::text, 'allow_policy'::text, 'deny'::text]))),
    CONSTRAINT approval_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'expired'::text])))
);

--
-- Name: audit_events; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.audit_events (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    type text NOT NULL,
    actor_id text,
    tenant_id text,
    module_id text,
    operation_id text,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_kind text DEFAULT 'core'::text NOT NULL,
    source_module_id text,
    source_component text
);

--
-- Name: device_authorizations; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.device_authorizations (
    device_code_hash text NOT NULL,
    user_code text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested jsonb DEFAULT '{}'::jsonb NOT NULL,
    granted jsonb,
    client_name text,
    approved_by uuid,
    approved_tenant uuid,
    approved_at timestamp with time zone,
    last_polled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT device_authorizations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'consumed'::text, 'expired'::text])))
);

--
-- Name: feature_flags; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.feature_flags (
    key text NOT NULL,
    tenant_id uuid NOT NULL,
    enabled boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text
);

--
-- Name: invoice_line_items; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.invoice_line_items (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    invoice_id uuid NOT NULL,
    kind text NOT NULL,
    description text NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    unit_price_micros bigint DEFAULT 0 NOT NULL,
    amount_micros bigint DEFAULT 0 NOT NULL
);

--
-- Name: invoices; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.invoices (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    package_id text,
    period_start date NOT NULL,
    period_end date NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    total_micros bigint DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'void'::text])))
);

--
-- Name: notification_deliveries; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.notification_deliveries (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    notification_id uuid NOT NULL,
    channel text NOT NULL,
    target jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    not_before timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT notification_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);

--
-- Name: TABLE notification_deliveries; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON TABLE core.notification_deliveries IS 'Per-channel delivery ledger for a notification; claimed by whichever process has the channel registered.';

--
-- Name: notification_push_subscriptions; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.notification_push_subscriptions (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);

--
-- Name: notification_routes; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.notification_routes (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    stream_id uuid NOT NULL,
    channel text NOT NULL,
    target jsonb DEFAULT '{}'::jsonb NOT NULL,
    min_priority text DEFAULT 'low'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_routes_min_priority_check CHECK ((min_priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])))
);

--
-- Name: notification_seen; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.notification_seen (
    tenant_id uuid NOT NULL,
    notification_id uuid NOT NULL,
    user_id uuid NOT NULL,
    seen_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE notification_seen; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON TABLE core.notification_seen IS 'Per-person "seen" on a notification (@engenty/notifications): the row is shared, the glance is not.';

--
-- Name: notification_streams; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.notification_streams (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    space_id uuid,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: notifications; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.notifications (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    space_id uuid,
    audience_kind text NOT NULL,
    audience_id text,
    kind text NOT NULL,
    class text NOT NULL,
    source text NOT NULL,
    actor_kind text,
    actor_id text,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    summary text NOT NULL,
    payload jsonb,
    metadata jsonb,
    subject_type text,
    subject_id text,
    dedupe_key text,
    coalesce_key text,
    coalesced_count integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    dismissed_at timestamp with time zone,
    CONSTRAINT notifications_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['agent'::text, 'user'::text, 'system'::text]))),
    CONSTRAINT notifications_audience_kind_check CHECK ((audience_kind = ANY (ARRAY['tenant'::text, 'user'::text, 'stream'::text, 'space'::text]))),
    CONSTRAINT notifications_class_check CHECK ((class = ANY (ARRAY['decision'::text, 'alert'::text, 'todo'::text, 'update'::text]))),
    CONSTRAINT notifications_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT notifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'dismissed'::text, 'resolved'::text])))
);

--
-- Name: TABLE notifications; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON TABLE core.notifications IS 'Notification records (@engenty/notifications): a signal about something that happened or is waiting — never a work item.';

--
-- Name: packages; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.packages (
    id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    label text NOT NULL,
    modules jsonb,
    feature_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    ai_usage_policy jsonb NOT NULL,
    app_limits jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pricing jsonb
);

--
-- Name: TABLE packages; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON TABLE core.packages IS 'Synced mirror of the authored @engenty/entitlements catalog (pro-only).';

--
-- Name: platform_settings; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.platform_settings (
    scope text NOT NULL,
    tenant_id uuid,
    name text NOT NULL,
    type text NOT NULL,
    value_string text,
    value_jsonb jsonb,
    value_numeric numeric,
    value_boolean boolean,
    value_enc text,
    dek_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT platform_settings_scope_check CHECK ((scope = ANY (ARRAY['platform'::text, 'tenant'::text]))),
    CONSTRAINT platform_settings_scope_tenant_consistency CHECK ((((scope = 'platform'::text) AND (tenant_id IS NULL)) OR ((scope = 'tenant'::text) AND (tenant_id IS NOT NULL)))),
    CONSTRAINT platform_settings_type_check CHECK ((type = ANY (ARRAY['string'::text, 'numeric'::text, 'boolean'::text, 'json'::text, 'secret'::text]))),
    CONSTRAINT platform_settings_value_consistency CHECK ((((type = 'string'::text) AND (value_string IS NOT NULL)) OR ((type = 'numeric'::text) AND (value_numeric IS NOT NULL)) OR ((type = 'boolean'::text) AND (value_boolean IS NOT NULL)) OR ((type = 'json'::text) AND (value_jsonb IS NOT NULL)) OR ((type = 'secret'::text) AND (value_enc IS NOT NULL))))
);

--
-- Name: role_assignments; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.role_assignments (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    role_id text NOT NULL,
    user_id uuid,
    agent_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT role_assignments_check CHECK (((user_id IS NULL) <> (agent_id IS NULL)))
);

--
-- Name: satellites; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.satellites (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid,
    name text NOT NULL,
    slug text NOT NULL,
    status text DEFAULT 'provisioning'::text NOT NULL,
    endpoints jsonb DEFAULT '{}'::jsonb NOT NULL,
    credential_ref text,
    pinned_version text,
    health jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT satellites_status_check CHECK ((status = ANY (ARRAY['provisioning'::text, 'active'::text, 'suspended'::text, 'error'::text, 'archived'::text])))
);

--
-- Name: TABLE satellites; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON TABLE core.satellites IS 'Registry of per-tenant satellite stacks (Tier B); endpoints + health, secrets by reference only.';

--
-- Name: service_credential; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.service_credential (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid,
    name text NOT NULL,
    secret_hash text NOT NULL,
    capabilities jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled_at timestamp with time zone,
    last_used_at timestamp with time zone
);

--
-- Name: sessions; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.sessions (
    id uuid NOT NULL,
    principal_id text NOT NULL,
    tenant_id uuid,
    refresh_token_id uuid NOT NULL,
    refresh_token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);

--
-- Name: space_browser_grants; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.space_browser_grants (
    tenant_id uuid NOT NULL,
    space_id uuid NOT NULL,
    user_id uuid NOT NULL,
    unattended boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    autostart boolean DEFAULT false NOT NULL
);

--
-- Name: TABLE space_browser_grants; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON TABLE core.space_browser_grants IS 'Per user × space consent for the user''s own browser: unattended = agents may drive it while the user is away.';

--
-- Name: COLUMN space_browser_grants.autostart; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.space_browser_grants.autostart IS 'Agents may start (create) the user''s browser in this space without asking first.';

--
-- Name: space_member; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.space_member (
    tenant_id uuid NOT NULL,
    space_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT space_member_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text])))
);

--
-- Name: space_mount; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.space_mount (
    tenant_id uuid NOT NULL,
    space_id uuid NOT NULL,
    resource_type text NOT NULL,
    resource_key text NOT NULL,
    record_scope text,
    agent_access text,
    is_required boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reports_to text,
    CONSTRAINT space_mount_access_config_check CHECK (((resource_type = 'module'::text) OR ((record_scope IS NULL) AND
CASE resource_type
    WHEN 'connection'::text THEN ((agent_access IS NULL) OR (agent_access = ANY (ARRAY['none'::text, 'read'::text, 'write'::text])))
    ELSE (agent_access IS NULL)
END))),
    CONSTRAINT space_mount_module_config_check CHECK (((resource_type <> 'module'::text) OR ((agent_access IS NOT NULL) AND (agent_access = ANY (ARRAY['none'::text, 'read'::text, 'write'::text])) AND ((record_scope IS NULL) OR (record_scope = ANY (ARRAY['space'::text, 'all'::text])))))),
    CONSTRAINT space_mount_reports_to_check CHECK (((reports_to IS NULL) OR ((resource_type = 'agent'::text) AND (reports_to <> resource_key)))),
    CONSTRAINT space_mount_resource_type_check CHECK ((resource_type = ANY (ARRAY['module'::text, 'agent'::text, 'skill'::text, 'connection'::text])))
);

--
-- Name: COLUMN space_mount.record_scope; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.space_mount.record_scope IS 'Reserved: per-space narrowing of a mounted module''s records. NULL = undecided, which is every row today. Write it only once something reads it.';

--
-- Name: spaces; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.spaces (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    icon text,
    color text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    visibility text DEFAULT 'open'::text NOT NULL,
    owner_user_id uuid,
    agent_approval_mode text,
    computer_network_tier text,
    deleted_at timestamp with time zone,
    purge_after timestamp with time zone,
    description text,
    CONSTRAINT spaces_agent_approval_mode_check CHECK (((agent_approval_mode IS NULL) OR (agent_approval_mode = ANY (ARRAY['manual'::text, 'auto'::text, 'pass-all'::text])))),
    CONSTRAINT spaces_computer_network_tier_check CHECK (((computer_network_tier IS NULL) OR (computer_network_tier = ANY (ARRAY['none'::text, 'egress'::text])))),
    CONSTRAINT spaces_default_not_personal_check CHECK ((NOT (is_default AND (owner_user_id IS NOT NULL)))),
    CONSTRAINT spaces_deleted_purge_pair_check CHECK ((((deleted_at IS NULL) AND (purge_after IS NULL)) OR ((deleted_at IS NOT NULL) AND (purge_after IS NOT NULL)))),
    CONSTRAINT spaces_key_format_check CHECK ((key ~ '^[a-z0-9][a-z0-9-]{0,62}$'::text)),
    CONSTRAINT spaces_personal_is_private_check CHECK (((owner_user_id IS NULL) OR (visibility = 'private'::text))),
    CONSTRAINT spaces_visibility_check CHECK ((visibility = ANY (ARRAY['open'::text, 'private'::text])))
);

--
-- Name: COLUMN spaces.agent_approval_mode; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.spaces.agent_approval_mode IS 'Override of tenant agent-approval mode for engentys in this space. Null inherits. Never more permissive than the tenant ceiling.';

--
-- Name: COLUMN spaces.computer_network_tier; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.spaces.computer_network_tier IS 'Network reach of this space''s shared computer: none (no network) or egress (through the host allowlist proxy). Null inherits the host default.';

--
-- Name: COLUMN spaces.description; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.spaces.description IS 'One line about what this space is for. Shown on the space home; never parsed.';

--
-- Name: tenant_entitlement_overrides; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.tenant_entitlement_overrides (
    tenant_id uuid NOT NULL,
    override jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: tenant_plugin_overrides; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.tenant_plugin_overrides (
    tenant_id uuid NOT NULL,
    plugin_id text NOT NULL,
    enabled boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: tenant_roles; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.tenant_roles (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    tenant_id uuid NOT NULL,
    role_id text NOT NULL,
    title text NOT NULL,
    description text,
    capabilities text[] NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_roles_role_id_check CHECK ((role_id ~~ 'custom.%'::text))
);

--
-- Name: tenant_settings; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.tenant_settings (
    tenant_id uuid NOT NULL,
    scope_id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    value_string text,
    value_jsonb jsonb,
    value_numeric numeric,
    value_boolean boolean,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_settings_type_check CHECK ((type = ANY (ARRAY['string'::text, 'numeric'::text, 'boolean'::text, 'json'::text]))),
    CONSTRAINT tenant_settings_value_consistency CHECK ((((type = 'string'::text) AND (value_string IS NOT NULL)) OR ((type = 'numeric'::text) AND (value_numeric IS NOT NULL)) OR ((type = 'boolean'::text) AND (value_boolean IS NOT NULL)) OR ((type = 'json'::text) AND (value_jsonb IS NOT NULL))))
);

ALTER TABLE ONLY core.tenant_settings REPLICA IDENTITY FULL;

--
-- Name: tenants; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.tenants (
    id uuid DEFAULT public.uuidv7() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    tenant_connection_mode text DEFAULT 'shared_instance'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tier text DEFAULT 'platform'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    package_id text,
    CONSTRAINT tenants_connection_mode_check CHECK ((tenant_connection_mode = ANY (ARRAY['shared_instance'::text, 'dedicated_instance'::text]))),
    CONSTRAINT tenants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'provisioning'::text, 'archived'::text]))),
    CONSTRAINT tenants_tier_check CHECK ((tier = ANY (ARRAY['platform'::text, 'satellite'::text])))
);

--
-- Name: COLUMN tenants.tier; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.tenants.tier IS 'Tenancy tier per docs/internal/tenancy-spec.md; supersedes tenant_connection_mode (kept one release for rollback).';

--
-- Name: COLUMN tenants.package_id; Type: COMMENT; Schema: core; Owner: -
--

COMMENT ON COLUMN core.tenants.package_id IS 'Assigned commercial package; composed with tenant_entitlement_overrides.';

--
-- Name: user_settings; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.user_settings (
    user_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    value_string text,
    value_jsonb jsonb,
    value_numeric numeric,
    value_boolean boolean,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL,
    CONSTRAINT user_settings_type_check CHECK ((type = ANY (ARRAY['string'::text, 'numeric'::text, 'boolean'::text, 'json'::text]))),
    CONSTRAINT user_settings_value_consistency CHECK ((((type = 'string'::text) AND (value_string IS NOT NULL)) OR ((type = 'numeric'::text) AND (value_numeric IS NOT NULL)) OR ((type = 'boolean'::text) AND (value_boolean IS NOT NULL)) OR ((type = 'json'::text) AND (value_jsonb IS NOT NULL))))
);

ALTER TABLE ONLY core.user_settings REPLICA IDENTITY FULL;

--
-- Name: user_tenant_roles; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.user_tenant_roles (
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_tenant_roles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text])))
);

--
-- Name: users; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.users (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    display_name text,
    role text DEFAULT 'member'::text NOT NULL,
    employee_number text,
    "position" text,
    location text,
    department text,
    phone text,
    initials text,
    private_phone text,
    private_email text,
    private_address text,
    emergency_contact text,
    is_super_admin boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: file_storage_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_storage_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    storage_key text NOT NULL,
    filename text NOT NULL,
    mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    module text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: agent_run_event agent_run_event_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.agent_run_event
    ADD CONSTRAINT agent_run_event_pkey PRIMARY KEY (id);

--
-- Name: agent_run_event agent_run_event_run_id_seq_key; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.agent_run_event
    ADD CONSTRAINT agent_run_event_run_id_seq_key UNIQUE (run_id, seq);

--
-- Name: thread_message agent_session_message_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread_message
    ADD CONSTRAINT agent_session_message_pkey PRIMARY KEY (id);

--
-- Name: thread_participant agent_session_participant_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread_participant
    ADD CONSTRAINT agent_session_participant_pkey PRIMARY KEY (id);

--
-- Name: thread_participant agent_session_participant_thread_id_principal_type_princip_key; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread_participant
    ADD CONSTRAINT agent_session_participant_thread_id_principal_type_princip_key UNIQUE (thread_id, principal_type, principal_id);

--
-- Name: thread agent_session_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread
    ADD CONSTRAINT agent_session_pkey PRIMARY KEY (id);

--
-- Name: agent_run agent_session_run_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.agent_run
    ADD CONSTRAINT agent_session_run_pkey PRIMARY KEY (id);

--
-- Name: artifact artifact_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.artifact
    ADD CONSTRAINT artifact_pkey PRIMARY KEY (id);

--
-- Name: artifact_storage_binding artifact_storage_binding_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.artifact_storage_binding
    ADD CONSTRAINT artifact_storage_binding_pkey PRIMARY KEY (id);

--
-- Name: artifact_storage_binding artifact_storage_binding_tenant_id_scope_type_scope_id_key; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.artifact_storage_binding
    ADD CONSTRAINT artifact_storage_binding_tenant_id_scope_type_scope_id_key UNIQUE (tenant_id, scope_type, scope_id);

--
-- Name: artifact_version artifact_version_artifact_id_version_key; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.artifact_version
    ADD CONSTRAINT artifact_version_artifact_id_version_key UNIQUE (artifact_id, version);

--
-- Name: artifact_version artifact_version_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.artifact_version
    ADD CONSTRAINT artifact_version_pkey PRIMARY KEY (id);

--
-- Name: data_table data_table_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.data_table
    ADD CONSTRAINT data_table_pkey PRIMARY KEY (id);

--
-- Name: data_table_row data_table_row_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.data_table_row
    ADD CONSTRAINT data_table_row_pkey PRIMARY KEY (id);

--
-- Name: engenty_ai_agents engenty_ai_agents_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_ai_agents
    ADD CONSTRAINT engenty_ai_agents_pkey PRIMARY KEY (id);

--
-- Name: engenty_ai_agents engenty_ai_agents_tenant_id_agent_id_key; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_ai_agents
    ADD CONSTRAINT engenty_ai_agents_tenant_id_agent_id_key UNIQUE (tenant_id, agent_id);

--
-- Name: engenty_ai_tools engenty_ai_tools_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_ai_tools
    ADD CONSTRAINT engenty_ai_tools_pkey PRIMARY KEY (id);

--
-- Name: engenty_ai_tools engenty_ai_tools_tenant_id_tool_id_key; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_ai_tools
    ADD CONSTRAINT engenty_ai_tools_tenant_id_tool_id_key UNIQUE (tenant_id, tool_id);

--
-- Name: engenty_instruction_changes engenty_instruction_changes_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_instruction_changes
    ADD CONSTRAINT engenty_instruction_changes_pkey PRIMARY KEY (id);

--
-- Name: engenty_instruction_overrides engenty_instruction_overrides_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_instruction_overrides
    ADD CONSTRAINT engenty_instruction_overrides_pkey PRIMARY KEY (id);

--
-- Name: gateway_model_sync_run gateway_model_sync_run_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.gateway_model_sync_run
    ADD CONSTRAINT gateway_model_sync_run_pkey PRIMARY KEY (id);

--
-- Name: gateway_model_sync_settings gateway_model_sync_settings_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.gateway_model_sync_settings
    ADD CONSTRAINT gateway_model_sync_settings_pkey PRIMARY KEY (id);

--
-- Name: model_binding model_binding_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.model_binding
    ADD CONSTRAINT model_binding_pkey PRIMARY KEY (scope, role);

--
-- Name: model model_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.model
    ADD CONSTRAINT model_pkey PRIMARY KEY (gateway, model_id);

--
-- Name: model_pricing model_pricing_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.model_pricing
    ADD CONSTRAINT model_pricing_pkey PRIMARY KEY (id);

--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

--
-- Name: routine_triggers routine_triggers_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.routine_triggers
    ADD CONSTRAINT routine_triggers_pkey PRIMARY KEY (id);

--
-- Name: routines routines_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.routines
    ADD CONSTRAINT routines_pkey PRIMARY KEY (id);

--
-- Name: tenant_usage_policy tenant_usage_policy_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.tenant_usage_policy
    ADD CONSTRAINT tenant_usage_policy_pkey PRIMARY KEY (tenant_id);

--
-- Name: thread_agent thread_agent_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread_agent
    ADD CONSTRAINT thread_agent_pkey PRIMARY KEY (thread_id, agent_id);

--
-- Name: usage_event usage_event_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.usage_event
    ADD CONSTRAINT usage_event_pkey PRIMARY KEY (id);

--
-- Name: usage_period_total usage_period_total_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.usage_period_total
    ADD CONSTRAINT usage_period_total_pkey PRIMARY KEY (tenant_id, user_id, period_start);

--
-- Name: user_usage_policy user_usage_policy_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.user_usage_policy
    ADD CONSTRAINT user_usage_policy_pkey PRIMARY KEY (tenant_id, user_id);

--
-- Name: workflow workflow_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow
    ADD CONSTRAINT workflow_pkey PRIMARY KEY (id);

--
-- Name: workflow_run workflow_run_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_run
    ADD CONSTRAINT workflow_run_pkey PRIMARY KEY (id);

--
-- Name: workflow_version workflow_version_pkey; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_version
    ADD CONSTRAINT workflow_version_pkey PRIMARY KEY (id);

--
-- Name: workflow_version workflow_version_unique; Type: CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_version
    ADD CONSTRAINT workflow_version_unique UNIQUE (workflow_id, version);

--
-- Name: agent_goal_grants agent_goal_grants_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.agent_goal_grants
    ADD CONSTRAINT agent_goal_grants_pkey PRIMARY KEY (id);

--
-- Name: agent_goal_grants agent_goal_grants_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.agent_goal_grants
    ADD CONSTRAINT agent_goal_grants_unique UNIQUE NULLS NOT DISTINCT (tenant_id, goal_id, agent_id, capability);

--
-- Name: agents agents_id_tenant_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.agents
    ADD CONSTRAINT agents_id_tenant_unique UNIQUE (id, tenant_id);

--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);

--
-- Name: api_tokens api_tokens_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);

--
-- Name: approval_grants approval_grants_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.approval_grants
    ADD CONSTRAINT approval_grants_pkey PRIMARY KEY (id);

--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);

--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);

--
-- Name: device_authorizations device_authorizations_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.device_authorizations
    ADD CONSTRAINT device_authorizations_pkey PRIMARY KEY (device_code_hash);

--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (key, tenant_id);

--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);

--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

--
-- Name: notification_deliveries notification_deliveries_notification_id_channel_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_deliveries
    ADD CONSTRAINT notification_deliveries_notification_id_channel_key UNIQUE (notification_id, channel);

--
-- Name: notification_deliveries notification_deliveries_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_deliveries
    ADD CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id);

--
-- Name: notification_push_subscriptions notification_push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_push_subscriptions
    ADD CONSTRAINT notification_push_subscriptions_endpoint_key UNIQUE (endpoint);

--
-- Name: notification_push_subscriptions notification_push_subscriptions_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_push_subscriptions
    ADD CONSTRAINT notification_push_subscriptions_pkey PRIMARY KEY (id);

--
-- Name: notification_routes notification_routes_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_routes
    ADD CONSTRAINT notification_routes_pkey PRIMARY KEY (id);

--
-- Name: notification_seen notification_seen_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_seen
    ADD CONSTRAINT notification_seen_pkey PRIMARY KEY (notification_id, user_id);

--
-- Name: notification_streams notification_streams_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_streams
    ADD CONSTRAINT notification_streams_pkey PRIMARY KEY (id);

--
-- Name: notification_streams notification_streams_tenant_id_key_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_streams
    ADD CONSTRAINT notification_streams_tenant_id_key_key UNIQUE (tenant_id, key);

--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);

--
-- Name: role_assignments role_assignments_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role_assignments
    ADD CONSTRAINT role_assignments_pkey PRIMARY KEY (id);

--
-- Name: role_assignments role_assignments_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role_assignments
    ADD CONSTRAINT role_assignments_unique UNIQUE NULLS NOT DISTINCT (tenant_id, role_id, user_id, agent_id);

--
-- Name: satellites satellites_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.satellites
    ADD CONSTRAINT satellites_pkey PRIMARY KEY (id);

--
-- Name: satellites satellites_slug_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.satellites
    ADD CONSTRAINT satellites_slug_key UNIQUE (slug);

--
-- Name: service_credential service_credential_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.service_credential
    ADD CONSTRAINT service_credential_pkey PRIMARY KEY (id);

--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

--
-- Name: space_browser_grants space_browser_grants_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.space_browser_grants
    ADD CONSTRAINT space_browser_grants_pkey PRIMARY KEY (tenant_id, space_id, user_id);

--
-- Name: space_member space_member_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.space_member
    ADD CONSTRAINT space_member_pkey PRIMARY KEY (tenant_id, space_id, user_id);

--
-- Name: space_mount space_mount_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.space_mount
    ADD CONSTRAINT space_mount_pkey PRIMARY KEY (tenant_id, space_id, resource_type, resource_key);

--
-- Name: spaces spaces_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.spaces
    ADD CONSTRAINT spaces_pkey PRIMARY KEY (id);

--
-- Name: tenant_entitlement_overrides tenant_entitlement_overrides_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenant_entitlement_overrides
    ADD CONSTRAINT tenant_entitlement_overrides_pkey PRIMARY KEY (tenant_id);

--
-- Name: tenant_plugin_overrides tenant_plugin_overrides_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenant_plugin_overrides
    ADD CONSTRAINT tenant_plugin_overrides_pkey PRIMARY KEY (tenant_id, plugin_id);

--
-- Name: tenant_roles tenant_roles_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenant_roles
    ADD CONSTRAINT tenant_roles_pkey PRIMARY KEY (id);

--
-- Name: tenant_roles tenant_roles_tenant_id_role_id_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenant_roles
    ADD CONSTRAINT tenant_roles_tenant_id_role_id_key UNIQUE (tenant_id, role_id);

--
-- Name: tenant_settings tenant_settings_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenant_settings
    ADD CONSTRAINT tenant_settings_pkey PRIMARY KEY (tenant_id, scope_id, name);

--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);

--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);

--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id, name);

--
-- Name: user_tenant_roles user_tenant_roles_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_tenant_roles
    ADD CONSTRAINT user_tenant_roles_pkey PRIMARY KEY (user_id, tenant_id);

--
-- Name: users users_id_tenant_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_id_tenant_key UNIQUE (id, tenant_id);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: users users_tenant_id_email_key; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_tenant_id_email_key UNIQUE (tenant_id, email);

--
-- Name: file_storage_objects file_storage_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_storage_objects
    ADD CONSTRAINT file_storage_objects_pkey PRIMARY KEY (id);

--
-- Name: file_storage_objects file_storage_objects_storage_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_storage_objects
    ADD CONSTRAINT file_storage_objects_storage_key_key UNIQUE (storage_key);

--
-- Name: agent_run_event_run_seq_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_run_event_run_seq_idx ON ai.agent_run_event USING btree (run_id, seq);

--
-- Name: agent_session_message_session_id_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_session_message_session_id_idx ON ai.thread_message USING btree (thread_id, id);

--
-- Name: agent_session_participant_session_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_session_participant_session_idx ON ai.thread_participant USING btree (thread_id);

--
-- Name: agent_session_participant_tenant_principal_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_session_participant_tenant_principal_idx ON ai.thread_participant USING btree (tenant_id, principal_type, principal_id);

--
-- Name: agent_session_run_session_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_session_run_session_idx ON ai.agent_run USING btree (thread_id, started_at DESC);

--
-- Name: agent_session_run_session_started_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_session_run_session_started_idx ON ai.agent_run USING btree (thread_id, started_at DESC);

--
-- Name: agent_session_run_tenant_agent_started_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_session_run_tenant_agent_started_idx ON ai.agent_run USING btree (tenant_id, agent_id, started_at DESC);

--
-- Name: agent_session_tenant_agent_type_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_session_tenant_agent_type_idx ON ai.thread USING btree (tenant_id, agent_id);

--
-- Name: agent_session_tenant_creator_updated_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_session_tenant_creator_updated_idx ON ai.thread USING btree (tenant_id, created_by_user_id, updated_at DESC);

--
-- Name: agent_session_tenant_status_updated_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_session_tenant_status_updated_idx ON ai.thread USING btree (tenant_id, status, updated_at DESC);

--
-- Name: agent_session_tenant_updated_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_session_tenant_updated_idx ON ai.thread USING btree (tenant_id, updated_at DESC);

--
-- Name: agent_session_tenant_workspace_updated_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX agent_session_tenant_workspace_updated_idx ON ai.thread USING btree (tenant_id, workspace_key, updated_at DESC) WHERE (workspace_key IS NOT NULL);

--
-- Name: artifact_parent_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX artifact_parent_idx ON ai.artifact USING btree (tenant_id, scope_type, scope_id, parent_id) WHERE (status = 'active'::text);

--
-- Name: artifact_tenant_scope_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX artifact_tenant_scope_idx ON ai.artifact USING btree (tenant_id, scope_type, scope_id) WHERE (status = 'active'::text);

--
-- Name: artifact_thread_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX artifact_thread_idx ON ai.artifact USING btree (thread_id);

--
-- Name: data_table_row_table_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX data_table_row_table_idx ON ai.data_table_row USING btree (tenant_id, table_id);

--
-- Name: data_table_tenant_space_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX data_table_tenant_space_idx ON ai.data_table USING btree (tenant_id, space_id);

--
-- Name: engenty_ai_agents_core_agent_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX engenty_ai_agents_core_agent_idx ON ai.engenty_ai_agents USING btree (core_agent_id) WHERE (core_agent_id IS NOT NULL);

--
-- Name: engenty_ai_agents_status_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX engenty_ai_agents_status_idx ON ai.engenty_ai_agents USING btree (tenant_id, status);

--
-- Name: gateway_model_sync_run_started_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX gateway_model_sync_run_started_idx ON ai.gateway_model_sync_run USING btree (started_at DESC);

--
-- Name: idx_ai_push_subscriptions_user; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX idx_ai_push_subscriptions_user ON ai.push_subscriptions USING btree (tenant_id, user_id);

--
-- Name: idx_engenty_instruction_changes_doc_id; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX idx_engenty_instruction_changes_doc_id ON ai.engenty_instruction_changes USING btree (instruction_doc_id, created_at DESC);

--
-- Name: idx_engenty_instruction_overrides_lookup; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX idx_engenty_instruction_overrides_lookup ON ai.engenty_instruction_overrides USING btree (tenant_id, document_key, layer, created_by_user_id, is_active, version DESC);

--
-- Name: idx_engenty_instruction_overrides_module_id; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX idx_engenty_instruction_overrides_module_id ON ai.engenty_instruction_overrides USING btree (module_id);

--
-- Name: model_available_chat_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_available_chat_idx ON ai.model USING btree (model_id) WHERE available_for_chat;

--
-- Name: model_available_embedding_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_available_embedding_idx ON ai.model USING btree (model_id) WHERE available_for_embedding;

--
-- Name: model_available_image_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_available_image_idx ON ai.model USING btree (model_id) WHERE available_for_image;

--
-- Name: model_available_rerank_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_available_rerank_idx ON ai.model USING btree (model_id) WHERE available_for_rerank;

--
-- Name: model_available_routing_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_available_routing_idx ON ai.model USING btree (model_id) WHERE available_for_routing;

--
-- Name: model_available_video_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_available_video_idx ON ai.model USING btree (model_id) WHERE available_for_video;

--
-- Name: model_output_price_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_output_price_idx ON ai.model USING btree (output_per_mtok_micros, model_id);

--
-- Name: model_price_tier_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_price_tier_idx ON ai.model USING btree (price_tier, model_id);

--
-- Name: model_pricing_model_valid_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_pricing_model_valid_idx ON ai.model_pricing USING btree (model_id, valid_from DESC);

--
-- Name: model_provider_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_provider_idx ON ai.model USING btree (provider, model_id);

--
-- Name: model_tags_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_tags_idx ON ai.model USING gin (tags);

--
-- Name: model_use_cases_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX model_use_cases_idx ON ai.model USING gin (use_cases);

--
-- Name: routine_triggers_routine_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX routine_triggers_routine_idx ON ai.routine_triggers USING btree (routine_id);

--
-- Name: routine_triggers_tenant_kind_enabled_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX routine_triggers_tenant_kind_enabled_idx ON ai.routine_triggers USING btree (tenant_id, kind, enabled);

--
-- Name: routines_tenant_agent_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX routines_tenant_agent_idx ON ai.routines USING btree (tenant_id, agent_id);

--
-- Name: routines_tenant_declaration_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE UNIQUE INDEX routines_tenant_declaration_idx ON ai.routines USING btree (tenant_id, declaration_id) WHERE (declaration_id IS NOT NULL);

--
-- Name: routines_tenant_space_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX routines_tenant_space_idx ON ai.routines USING btree (tenant_id, space_id);

--
-- Name: thread_agent_agent_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX thread_agent_agent_idx ON ai.thread_agent USING btree (tenant_id, agent_id);

--
-- Name: thread_tenant_space_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX thread_tenant_space_idx ON ai.thread USING btree (tenant_id, space_id);

--
-- Name: usage_event_session_time_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX usage_event_session_time_idx ON ai.usage_event USING btree (thread_id, occurred_at DESC);

--
-- Name: usage_event_space_time_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX usage_event_space_time_idx ON ai.usage_event USING btree (space_id, occurred_at DESC);

--
-- Name: usage_event_tenant_time_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX usage_event_tenant_time_idx ON ai.usage_event USING btree (tenant_id, occurred_at DESC);

--
-- Name: workflow_run_graph_version_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX workflow_run_graph_version_idx ON ai.workflow_run USING btree (workflow_version_id) WHERE (workflow_version_id IS NOT NULL);

--
-- Name: workflow_run_owner_task_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX workflow_run_owner_task_idx ON ai.workflow_run USING btree (owner_task_id) WHERE (owner_task_id IS NOT NULL);

--
-- Name: workflow_run_status_created_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX workflow_run_status_created_idx ON ai.workflow_run USING btree (status, created_at DESC);

--
-- Name: workflow_run_tenant_created_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX workflow_run_tenant_created_idx ON ai.workflow_run USING btree (tenant_id, created_at DESC);

--
-- Name: workflow_run_tenant_routine_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX workflow_run_tenant_routine_idx ON ai.workflow_run USING btree (tenant_id, routine_id, created_at DESC) WHERE (routine_id IS NOT NULL);

--
-- Name: workflow_run_tenant_workflow_context_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX workflow_run_tenant_workflow_context_idx ON ai.workflow_run USING btree (tenant_id, workflow_id, context_type, context_id, created_at DESC);

--
-- Name: workflow_run_thread_created_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX workflow_run_thread_created_idx ON ai.workflow_run USING btree (thread_id, created_at DESC);

--
-- Name: workflow_run_wake_at_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX workflow_run_wake_at_idx ON ai.workflow_run USING btree (wake_at) WHERE (wake_at IS NOT NULL);

--
-- Name: workflow_tenant_owner_name_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE UNIQUE INDEX workflow_tenant_owner_name_idx ON ai.workflow USING btree (tenant_id, COALESCE(owner_agent_id, ''::text), name);

--
-- Name: workflow_tenant_source_workflow_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE UNIQUE INDEX workflow_tenant_source_workflow_idx ON ai.workflow USING btree (tenant_id, source_workflow_id) WHERE (source_workflow_id IS NOT NULL);

--
-- Name: workflow_version_tenant_graph_idx; Type: INDEX; Schema: ai; Owner: -
--

CREATE INDEX workflow_version_tenant_graph_idx ON ai.workflow_version USING btree (tenant_id, workflow_id, version DESC);

--
-- Name: agent_goal_grants_lookup_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX agent_goal_grants_lookup_idx ON core.agent_goal_grants USING btree (tenant_id, goal_id, agent_id);

--
-- Name: agents_tenant_name_key; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX agents_tenant_name_key ON core.agents USING btree (tenant_id, name);

--
-- Name: api_tokens_principal; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX api_tokens_principal ON core.api_tokens USING btree (tenant_id, principal_id);

--
-- Name: approval_grants_lookup_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX approval_grants_lookup_idx ON core.approval_grants USING btree (tenant_id, actor_id, module_id, operation_id);

--
-- Name: approval_grants_subject_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX approval_grants_subject_idx ON core.approval_grants USING btree (tenant_id, scope, subject_id) WHERE (subject_id IS NOT NULL);

--
-- Name: approval_requests_pending_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX approval_requests_pending_idx ON core.approval_requests USING btree (tenant_id, status, created_at);

--
-- Name: audit_events_actor_id_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX audit_events_actor_id_idx ON core.audit_events USING btree (actor_id);

--
-- Name: audit_events_module_id_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX audit_events_module_id_idx ON core.audit_events USING btree (module_id);

--
-- Name: audit_events_tenant_id_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX audit_events_tenant_id_idx ON core.audit_events USING btree (tenant_id);

--
-- Name: audit_events_timestamp_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX audit_events_timestamp_idx ON core.audit_events USING btree ("timestamp" DESC);

--
-- Name: audit_events_type_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX audit_events_type_idx ON core.audit_events USING btree (type);

--
-- Name: device_authorizations_active_user_code; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX device_authorizations_active_user_code ON core.device_authorizations USING btree (user_code) WHERE (status = 'pending'::text);

--
-- Name: device_authorizations_expires_at; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX device_authorizations_expires_at ON core.device_authorizations USING btree (expires_at);

--
-- Name: feature_flags_tenant_id_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX feature_flags_tenant_id_idx ON core.feature_flags USING btree (tenant_id);

--
-- Name: idx_core_user_settings_tenant; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_core_user_settings_tenant ON core.user_settings USING btree (tenant_id);

--
-- Name: idx_platform_settings_tenant; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_platform_settings_tenant ON core.platform_settings USING btree (tenant_id) WHERE (scope = 'tenant'::text);

--
-- Name: idx_tenant_settings_tenant_scope; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_tenant_settings_tenant_scope ON core.tenant_settings USING btree (tenant_id, scope_id);

--
-- Name: idx_user_settings_user_id; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_user_settings_user_id ON core.user_settings USING btree (user_id);

--
-- Name: invoice_line_items_invoice_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX invoice_line_items_invoice_idx ON core.invoice_line_items USING btree (invoice_id);

--
-- Name: invoices_tenant_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX invoices_tenant_idx ON core.invoices USING btree (tenant_id, period_start DESC);

--
-- Name: notification_deliveries_due_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notification_deliveries_due_idx ON core.notification_deliveries USING btree (channel, status, not_before);

--
-- Name: notification_push_subscriptions_user_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notification_push_subscriptions_user_idx ON core.notification_push_subscriptions USING btree (tenant_id, user_id);

--
-- Name: notification_routes_stream_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notification_routes_stream_idx ON core.notification_routes USING btree (tenant_id, stream_id);

--
-- Name: notification_seen_user_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notification_seen_user_idx ON core.notification_seen USING btree (tenant_id, user_id);

--
-- Name: notifications_actor_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notifications_actor_idx ON core.notifications USING btree (tenant_id, actor_kind, actor_id, status);

--
-- Name: notifications_audience_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notifications_audience_idx ON core.notifications USING btree (tenant_id, audience_kind, audience_id, status);

--
-- Name: notifications_dedupe_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX notifications_dedupe_idx ON core.notifications USING btree (tenant_id, dedupe_key) WHERE ((status = 'pending'::text) AND (dedupe_key IS NOT NULL));

--
-- Name: notifications_open_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notifications_open_idx ON core.notifications USING btree (tenant_id, status, created_at DESC);

--
-- Name: notifications_space_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notifications_space_idx ON core.notifications USING btree (tenant_id, space_id, status);

--
-- Name: notifications_subject_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notifications_subject_idx ON core.notifications USING btree (tenant_id, subject_type, subject_id) WHERE (status = 'pending'::text);

--
-- Name: platform_settings_platform_name; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX platform_settings_platform_name ON core.platform_settings USING btree (name) WHERE (scope = 'platform'::text);

--
-- Name: platform_settings_tenant_name; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX platform_settings_tenant_name ON core.platform_settings USING btree (tenant_id, name) WHERE (scope = 'tenant'::text);

--
-- Name: role_assignments_agent_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX role_assignments_agent_idx ON core.role_assignments USING btree (tenant_id, agent_id);

--
-- Name: role_assignments_user_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX role_assignments_user_idx ON core.role_assignments USING btree (tenant_id, user_id);

--
-- Name: satellites_tenant_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX satellites_tenant_idx ON core.satellites USING btree (tenant_id);

--
-- Name: service_credential_active_name; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX service_credential_active_name ON core.service_credential USING btree (tenant_id, name) WHERE (disabled_at IS NULL);

--
-- Name: service_credential_active_platform_name; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX service_credential_active_platform_name ON core.service_credential USING btree (name) WHERE ((disabled_at IS NULL) AND (tenant_id IS NULL));

--
-- Name: service_credential_tenant; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX service_credential_tenant ON core.service_credential USING btree (tenant_id);

--
-- Name: sessions_principal; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX sessions_principal ON core.sessions USING btree (tenant_id, principal_id);

--
-- Name: space_member_user_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX space_member_user_idx ON core.space_member USING btree (tenant_id, user_id);

--
-- Name: space_mount_space_type_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX space_mount_space_type_idx ON core.space_mount USING btree (tenant_id, space_id, resource_type);

--
-- Name: spaces_id_tenant_key; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX spaces_id_tenant_key ON core.spaces USING btree (id, tenant_id);

--
-- Name: spaces_purge_due_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX spaces_purge_due_idx ON core.spaces USING btree (purge_after) WHERE (deleted_at IS NOT NULL);

--
-- Name: spaces_tenant_default_uniq; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX spaces_tenant_default_uniq ON core.spaces USING btree (tenant_id) WHERE is_default;

--
-- Name: spaces_tenant_key_uniq; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX spaces_tenant_key_uniq ON core.spaces USING btree (tenant_id, lower(key));

--
-- Name: spaces_tenant_personal_uniq; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX spaces_tenant_personal_uniq ON core.spaces USING btree (tenant_id, owner_user_id) WHERE (owner_user_id IS NOT NULL);

--
-- Name: spaces_tenant_visibility_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX spaces_tenant_visibility_idx ON core.spaces USING btree (tenant_id, visibility);

--
-- Name: tenant_plugin_overrides_tenant_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX tenant_plugin_overrides_tenant_idx ON core.tenant_plugin_overrides USING btree (tenant_id);

--
-- Name: tenants_package_id_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX tenants_package_id_idx ON core.tenants USING btree (package_id);

--
-- Name: user_tenant_roles_tenant_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX user_tenant_roles_tenant_idx ON core.user_tenant_roles USING btree (tenant_id);

--
-- Name: user_tenant_roles_user_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX user_tenant_roles_user_idx ON core.user_tenant_roles USING btree (user_id);

--
-- Name: idx_file_storage_objects_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_storage_objects_key ON public.file_storage_objects USING btree (storage_key);

--
-- Name: idx_file_storage_objects_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_storage_objects_module ON public.file_storage_objects USING btree (tenant_id, module);

--
-- Name: idx_file_storage_objects_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_file_storage_objects_tenant ON public.file_storage_objects USING btree (tenant_id);

--
-- Name: thread_message thread_message_bump_thread; Type: TRIGGER; Schema: ai; Owner: -
--

CREATE TRIGGER thread_message_bump_thread AFTER INSERT ON ai.thread_message FOR EACH ROW EXECUTE FUNCTION ai.bump_thread_updated_at();

--
-- Name: space_member space_member_forbid_personal; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER space_member_forbid_personal BEFORE INSERT OR UPDATE ON core.space_member FOR EACH ROW EXECUTE FUNCTION core.forbid_personal_space_member();

--
-- Name: spaces spaces_seed_baseline_mounts; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER spaces_seed_baseline_mounts AFTER INSERT ON core.spaces FOR EACH ROW EXECUTE FUNCTION core.seed_space_baseline_mounts();

--
-- Name: tenants tenants_ensure_default_space; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER tenants_ensure_default_space AFTER INSERT ON core.tenants FOR EACH ROW EXECUTE FUNCTION core.ensure_default_space();

--
-- Name: user_tenant_roles user_tenant_roles_ensure_personal_space; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER user_tenant_roles_ensure_personal_space AFTER INSERT ON core.user_tenant_roles FOR EACH ROW EXECUTE FUNCTION core.ensure_personal_space();

--
-- Name: user_tenant_roles user_tenant_roles_orphan_personal_space; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER user_tenant_roles_orphan_personal_space AFTER DELETE ON core.user_tenant_roles FOR EACH ROW EXECUTE FUNCTION core.orphan_personal_space_on_leave();

--
-- Name: agent_run_event agent_run_event_run_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.agent_run_event
    ADD CONSTRAINT agent_run_event_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai.agent_run(id) ON DELETE CASCADE;

--
-- Name: agent_run_event agent_run_event_session_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.agent_run_event
    ADD CONSTRAINT agent_run_event_session_id_fkey FOREIGN KEY (thread_id) REFERENCES ai.thread(id) ON DELETE CASCADE;

--
-- Name: agent_run_event agent_run_event_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.agent_run_event
    ADD CONSTRAINT agent_run_event_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: thread agent_session_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread
    ADD CONSTRAINT agent_session_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES core.users(id) ON DELETE RESTRICT;

--
-- Name: thread_message agent_session_message_author_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread_message
    ADD CONSTRAINT agent_session_message_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: thread_message agent_session_message_session_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread_message
    ADD CONSTRAINT agent_session_message_session_id_fkey FOREIGN KEY (thread_id) REFERENCES ai.thread(id) ON DELETE CASCADE;

--
-- Name: thread_message agent_session_message_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread_message
    ADD CONSTRAINT agent_session_message_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: thread_participant agent_session_participant_session_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread_participant
    ADD CONSTRAINT agent_session_participant_session_id_fkey FOREIGN KEY (thread_id) REFERENCES ai.thread(id) ON DELETE CASCADE;

--
-- Name: thread_participant agent_session_participant_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread_participant
    ADD CONSTRAINT agent_session_participant_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: agent_run agent_session_run_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.agent_run
    ADD CONSTRAINT agent_session_run_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: agent_run agent_session_run_session_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.agent_run
    ADD CONSTRAINT agent_session_run_session_id_fkey FOREIGN KEY (thread_id) REFERENCES ai.thread(id) ON DELETE CASCADE;

--
-- Name: agent_run agent_session_run_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.agent_run
    ADD CONSTRAINT agent_session_run_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: thread agent_session_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread
    ADD CONSTRAINT agent_session_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: artifact artifact_parent_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.artifact
    ADD CONSTRAINT artifact_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES ai.artifact(id) ON DELETE CASCADE;

--
-- Name: artifact_storage_binding artifact_storage_binding_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.artifact_storage_binding
    ADD CONSTRAINT artifact_storage_binding_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: artifact artifact_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.artifact
    ADD CONSTRAINT artifact_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: artifact_version artifact_version_artifact_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.artifact_version
    ADD CONSTRAINT artifact_version_artifact_id_fkey FOREIGN KEY (artifact_id) REFERENCES ai.artifact(id) ON DELETE CASCADE;

--
-- Name: artifact_version artifact_version_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.artifact_version
    ADD CONSTRAINT artifact_version_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: data_table_row data_table_row_table_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.data_table_row
    ADD CONSTRAINT data_table_row_table_id_fkey FOREIGN KEY (table_id) REFERENCES ai.data_table(id) ON DELETE CASCADE;

--
-- Name: data_table_row data_table_row_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.data_table_row
    ADD CONSTRAINT data_table_row_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: data_table data_table_space_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.data_table
    ADD CONSTRAINT data_table_space_id_fkey FOREIGN KEY (space_id) REFERENCES core.spaces(id) ON DELETE CASCADE;

--
-- Name: data_table data_table_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.data_table
    ADD CONSTRAINT data_table_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: engenty_ai_agents engenty_ai_agents_core_agent_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_ai_agents
    ADD CONSTRAINT engenty_ai_agents_core_agent_id_fkey FOREIGN KEY (core_agent_id) REFERENCES core.agents(id) ON DELETE SET NULL;

--
-- Name: engenty_ai_agents engenty_ai_agents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_ai_agents
    ADD CONSTRAINT engenty_ai_agents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: engenty_ai_tools engenty_ai_tools_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_ai_tools
    ADD CONSTRAINT engenty_ai_tools_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: engenty_instruction_changes engenty_instruction_changes_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_instruction_changes
    ADD CONSTRAINT engenty_instruction_changes_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: engenty_instruction_changes engenty_instruction_changes_instruction_doc_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_instruction_changes
    ADD CONSTRAINT engenty_instruction_changes_instruction_doc_id_fkey FOREIGN KEY (instruction_doc_id) REFERENCES ai.engenty_instruction_overrides(id) ON DELETE CASCADE;

--
-- Name: engenty_instruction_overrides engenty_instruction_overrides_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_instruction_overrides
    ADD CONSTRAINT engenty_instruction_overrides_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: engenty_instruction_overrides engenty_instruction_overrides_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_instruction_overrides
    ADD CONSTRAINT engenty_instruction_overrides_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: engenty_instruction_overrides engenty_instruction_overrides_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.engenty_instruction_overrides
    ADD CONSTRAINT engenty_instruction_overrides_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: push_subscriptions push_subscriptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.push_subscriptions
    ADD CONSTRAINT push_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: routine_triggers routine_triggers_routine_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.routine_triggers
    ADD CONSTRAINT routine_triggers_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES ai.routines(id) ON DELETE CASCADE;

--
-- Name: routine_triggers routine_triggers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.routine_triggers
    ADD CONSTRAINT routine_triggers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: routines routines_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.routines
    ADD CONSTRAINT routines_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: routines routines_space_fk; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.routines
    ADD CONSTRAINT routines_space_fk FOREIGN KEY (space_id, tenant_id) REFERENCES core.spaces(id, tenant_id) ON DELETE SET NULL (space_id);

--
-- Name: routines routines_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.routines
    ADD CONSTRAINT routines_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: routines routines_workflow_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.routines
    ADD CONSTRAINT routines_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES ai.workflow(id) ON DELETE RESTRICT;

--
-- Name: tenant_usage_policy tenant_usage_policy_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.tenant_usage_policy
    ADD CONSTRAINT tenant_usage_policy_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: thread_agent thread_agent_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread_agent
    ADD CONSTRAINT thread_agent_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: thread_agent thread_agent_thread_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread_agent
    ADD CONSTRAINT thread_agent_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES ai.thread(id) ON DELETE CASCADE;

--
-- Name: thread thread_space_tenant_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.thread
    ADD CONSTRAINT thread_space_tenant_fkey FOREIGN KEY (space_id, tenant_id) REFERENCES core.spaces(id, tenant_id) ON DELETE SET NULL (space_id);

--
-- Name: usage_event usage_event_pricing_version_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.usage_event
    ADD CONSTRAINT usage_event_pricing_version_id_fkey FOREIGN KEY (pricing_version_id) REFERENCES ai.model_pricing(id) ON DELETE SET NULL;

--
-- Name: usage_event usage_event_session_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.usage_event
    ADD CONSTRAINT usage_event_session_id_fkey FOREIGN KEY (thread_id) REFERENCES ai.thread(id) ON DELETE SET NULL;

--
-- Name: usage_event usage_event_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.usage_event
    ADD CONSTRAINT usage_event_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE SET NULL;

--
-- Name: usage_event usage_event_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.usage_event
    ADD CONSTRAINT usage_event_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: usage_period_total usage_period_total_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.usage_period_total
    ADD CONSTRAINT usage_period_total_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: user_usage_policy user_usage_policy_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.user_usage_policy
    ADD CONSTRAINT user_usage_policy_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: user_usage_policy user_usage_policy_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.user_usage_policy
    ADD CONSTRAINT user_usage_policy_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE CASCADE;

--
-- Name: workflow workflow_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow
    ADD CONSTRAINT workflow_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: workflow_run workflow_run_routine_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_run
    ADD CONSTRAINT workflow_run_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES ai.routines(id) ON DELETE SET NULL;

--
-- Name: workflow_run workflow_run_run_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_run
    ADD CONSTRAINT workflow_run_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai.agent_run(id) ON DELETE SET NULL;

--
-- Name: workflow_run workflow_run_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_run
    ADD CONSTRAINT workflow_run_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: workflow_run workflow_run_thread_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_run
    ADD CONSTRAINT workflow_run_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES ai.thread(id) ON DELETE SET NULL;

--
-- Name: workflow_run workflow_run_workflow_version_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_run
    ADD CONSTRAINT workflow_run_workflow_version_id_fkey FOREIGN KEY (workflow_version_id) REFERENCES ai.workflow_version(id) ON DELETE RESTRICT;

--
-- Name: workflow workflow_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow
    ADD CONSTRAINT workflow_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: workflow_version workflow_version_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_version
    ADD CONSTRAINT workflow_version_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: workflow_version workflow_version_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_version
    ADD CONSTRAINT workflow_version_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES core.users(id) ON DELETE SET NULL;

--
-- Name: workflow_version workflow_version_tenant_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_version
    ADD CONSTRAINT workflow_version_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: workflow_version workflow_version_workflow_id_fkey; Type: FK CONSTRAINT; Schema: ai; Owner: -
--

ALTER TABLE ONLY ai.workflow_version
    ADD CONSTRAINT workflow_version_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES ai.workflow(id) ON DELETE CASCADE;

--
-- Name: agent_goal_grants agent_goal_grants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.agent_goal_grants
    ADD CONSTRAINT agent_goal_grants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: agents agents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.agents
    ADD CONSTRAINT agents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: approval_grants approval_grants_request_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.approval_grants
    ADD CONSTRAINT approval_grants_request_id_fkey FOREIGN KEY (request_id) REFERENCES core.approval_requests(id) ON DELETE SET NULL;

--
-- Name: approval_grants approval_grants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.approval_grants
    ADD CONSTRAINT approval_grants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: approval_requests approval_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.approval_requests
    ADD CONSTRAINT approval_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: feature_flags feature_flags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.feature_flags
    ADD CONSTRAINT feature_flags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: invoice_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES core.invoices(id) ON DELETE CASCADE;

--
-- Name: invoices invoices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.invoices
    ADD CONSTRAINT invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: notification_deliveries notification_deliveries_notification_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_deliveries
    ADD CONSTRAINT notification_deliveries_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES core.notifications(id) ON DELETE CASCADE;

--
-- Name: notification_deliveries notification_deliveries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_deliveries
    ADD CONSTRAINT notification_deliveries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: notification_push_subscriptions notification_push_subscriptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_push_subscriptions
    ADD CONSTRAINT notification_push_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: notification_routes notification_routes_stream_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_routes
    ADD CONSTRAINT notification_routes_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES core.notification_streams(id) ON DELETE CASCADE;

--
-- Name: notification_routes notification_routes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_routes
    ADD CONSTRAINT notification_routes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: notification_seen notification_seen_notification_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_seen
    ADD CONSTRAINT notification_seen_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES core.notifications(id) ON DELETE CASCADE;

--
-- Name: notification_seen notification_seen_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_seen
    ADD CONSTRAINT notification_seen_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: notification_streams notification_streams_space_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_streams
    ADD CONSTRAINT notification_streams_space_fk FOREIGN KEY (space_id, tenant_id) REFERENCES core.spaces(id, tenant_id) ON DELETE SET NULL (space_id);

--
-- Name: notification_streams notification_streams_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification_streams
    ADD CONSTRAINT notification_streams_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: notifications notifications_space_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notifications
    ADD CONSTRAINT notifications_space_fk FOREIGN KEY (space_id, tenant_id) REFERENCES core.spaces(id, tenant_id) ON DELETE SET NULL (space_id);

--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notifications
    ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: platform_settings platform_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.platform_settings
    ADD CONSTRAINT platform_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: role_assignments role_assignments_agent_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role_assignments
    ADD CONSTRAINT role_assignments_agent_id_tenant_id_fkey FOREIGN KEY (agent_id, tenant_id) REFERENCES core.agents(id, tenant_id) ON DELETE CASCADE;

--
-- Name: role_assignments role_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role_assignments
    ADD CONSTRAINT role_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: role_assignments role_assignments_user_id_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role_assignments
    ADD CONSTRAINT role_assignments_user_id_tenant_id_fkey FOREIGN KEY (user_id, tenant_id) REFERENCES core.user_tenant_roles(user_id, tenant_id) ON DELETE CASCADE;

--
-- Name: satellites satellites_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.satellites
    ADD CONSTRAINT satellites_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE SET NULL;

--
-- Name: service_credential service_credential_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.service_credential
    ADD CONSTRAINT service_credential_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: space_browser_grants space_browser_grants_space_tenant_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.space_browser_grants
    ADD CONSTRAINT space_browser_grants_space_tenant_fkey FOREIGN KEY (space_id, tenant_id) REFERENCES core.spaces(id, tenant_id) ON DELETE CASCADE;

--
-- Name: space_browser_grants space_browser_grants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.space_browser_grants
    ADD CONSTRAINT space_browser_grants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: space_browser_grants space_browser_grants_user_tenant_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.space_browser_grants
    ADD CONSTRAINT space_browser_grants_user_tenant_fkey FOREIGN KEY (user_id, tenant_id) REFERENCES core.users(id, tenant_id) ON DELETE CASCADE;

--
-- Name: space_member space_member_space_tenant_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.space_member
    ADD CONSTRAINT space_member_space_tenant_fkey FOREIGN KEY (space_id, tenant_id) REFERENCES core.spaces(id, tenant_id) ON DELETE CASCADE;

--
-- Name: space_member space_member_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.space_member
    ADD CONSTRAINT space_member_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: space_member space_member_user_tenant_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.space_member
    ADD CONSTRAINT space_member_user_tenant_fkey FOREIGN KEY (user_id, tenant_id) REFERENCES core.users(id, tenant_id) ON DELETE CASCADE;

--
-- Name: space_mount space_mount_space_tenant_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.space_mount
    ADD CONSTRAINT space_mount_space_tenant_fkey FOREIGN KEY (space_id, tenant_id) REFERENCES core.spaces(id, tenant_id) ON DELETE CASCADE;

--
-- Name: space_mount space_mount_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.space_mount
    ADD CONSTRAINT space_mount_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: spaces spaces_owner_user_tenant_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.spaces
    ADD CONSTRAINT spaces_owner_user_tenant_fkey FOREIGN KEY (owner_user_id, tenant_id) REFERENCES core.users(id, tenant_id) ON DELETE SET NULL (owner_user_id);

--
-- Name: spaces spaces_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.spaces
    ADD CONSTRAINT spaces_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: tenant_entitlement_overrides tenant_entitlement_overrides_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenant_entitlement_overrides
    ADD CONSTRAINT tenant_entitlement_overrides_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: tenant_plugin_overrides tenant_plugin_overrides_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenant_plugin_overrides
    ADD CONSTRAINT tenant_plugin_overrides_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: tenant_roles tenant_roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenant_roles
    ADD CONSTRAINT tenant_roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: tenant_settings tenant_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenant_settings
    ADD CONSTRAINT tenant_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: tenants tenants_package_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.tenants
    ADD CONSTRAINT tenants_package_id_fkey FOREIGN KEY (package_id) REFERENCES core.packages(id) ON DELETE SET NULL;

--
-- Name: user_settings user_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_settings
    ADD CONSTRAINT user_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE CASCADE;

--
-- Name: user_settings user_settings_user_tenant_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_settings
    ADD CONSTRAINT user_settings_user_tenant_fkey FOREIGN KEY (user_id, tenant_id) REFERENCES core.users(id, tenant_id) ON DELETE CASCADE;

--
-- Name: user_tenant_roles user_tenant_roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_tenant_roles
    ADD CONSTRAINT user_tenant_roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: user_tenant_roles user_tenant_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_tenant_roles
    ADD CONSTRAINT user_tenant_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE CASCADE;

--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE;

--
-- Name: agent_run; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.agent_run ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_run agent_run_delete; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY agent_run_delete ON ai.agent_run FOR DELETE TO authenticated USING (((tenant_id = core.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM ai.thread_participant p
  WHERE ((p.thread_id = agent_run.thread_id) AND (p.tenant_id = agent_run.tenant_id) AND (p.principal_type = 'user'::ai.session_principal_type) AND (p.principal_id = ((core.current_jwt() ->> 'sub'::text))::uuid))))));

--
-- Name: agent_run_event; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.agent_run_event ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_run_event agent_run_event_delete; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY agent_run_event_delete ON ai.agent_run_event FOR DELETE TO authenticated USING (((tenant_id = core.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM ai.thread_participant p
  WHERE ((p.thread_id = agent_run_event.thread_id) AND (p.tenant_id = agent_run_event.tenant_id) AND (p.principal_type = 'user'::ai.session_principal_type) AND (p.principal_id = ((core.current_jwt() ->> 'sub'::text))::uuid))))));

--
-- Name: agent_run_event agent_run_event_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY agent_run_event_insert ON ai.agent_run_event FOR INSERT TO authenticated WITH CHECK (((tenant_id = core.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM ai.thread_participant p
  WHERE ((p.thread_id = agent_run_event.thread_id) AND (p.tenant_id = agent_run_event.tenant_id) AND (p.principal_type = 'user'::ai.session_principal_type) AND (p.principal_id = ((core.current_jwt() ->> 'sub'::text))::uuid))))));

--
-- Name: agent_run_event agent_run_event_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY agent_run_event_select ON ai.agent_run_event FOR SELECT TO authenticated USING (((tenant_id = core.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM ai.thread_participant p
  WHERE ((p.thread_id = agent_run_event.thread_id) AND (p.tenant_id = agent_run_event.tenant_id) AND (p.principal_type = 'user'::ai.session_principal_type) AND (p.principal_id = ((core.current_jwt() ->> 'sub'::text))::uuid))))));

--
-- Name: agent_run agent_run_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY agent_run_insert ON ai.agent_run FOR INSERT TO authenticated WITH CHECK (((tenant_id = core.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM ai.thread_participant p
  WHERE ((p.thread_id = agent_run.thread_id) AND (p.tenant_id = agent_run.tenant_id) AND (p.principal_type = 'user'::ai.session_principal_type) AND (p.principal_id = ((core.current_jwt() ->> 'sub'::text))::uuid))))));

--
-- Name: agent_run agent_run_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY agent_run_select ON ai.agent_run FOR SELECT TO authenticated USING (((tenant_id = core.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM ai.thread_participant p
  WHERE ((p.thread_id = agent_run.thread_id) AND (p.tenant_id = agent_run.tenant_id) AND (p.principal_type = 'user'::ai.session_principal_type) AND (p.principal_id = ((core.current_jwt() ->> 'sub'::text))::uuid))))));

--
-- Name: agent_run agent_run_update; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY agent_run_update ON ai.agent_run FOR UPDATE TO authenticated USING (((tenant_id = core.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM ai.thread_participant p
  WHERE ((p.thread_id = agent_run.thread_id) AND (p.tenant_id = agent_run.tenant_id) AND (p.principal_type = 'user'::ai.session_principal_type) AND (p.principal_id = ((core.current_jwt() ->> 'sub'::text))::uuid))))));

--
-- Name: artifact; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.artifact ENABLE ROW LEVEL SECURITY;

--
-- Name: artifact artifact_select_tenant; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY artifact_select_tenant ON ai.artifact FOR SELECT TO authenticated USING ((tenant_id = core.current_tenant_id()));

--
-- Name: artifact_storage_binding; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.artifact_storage_binding ENABLE ROW LEVEL SECURITY;

--
-- Name: artifact_version; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.artifact_version ENABLE ROW LEVEL SECURITY;

--
-- Name: data_table; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.data_table ENABLE ROW LEVEL SECURITY;

--
-- Name: data_table_row; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.data_table_row ENABLE ROW LEVEL SECURITY;

--
-- Name: data_table_row data_table_row_select_tenant; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY data_table_row_select_tenant ON ai.data_table_row FOR SELECT TO authenticated USING ((tenant_id = core.current_tenant_id()));

--
-- Name: data_table data_table_select_tenant; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY data_table_select_tenant ON ai.data_table FOR SELECT TO authenticated USING ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_ai_agents; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.engenty_ai_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: engenty_ai_agents engenty_ai_agents_delete; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_ai_agents_delete ON ai.engenty_ai_agents FOR DELETE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_ai_agents engenty_ai_agents_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_ai_agents_insert ON ai.engenty_ai_agents FOR INSERT WITH CHECK ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_ai_agents engenty_ai_agents_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_ai_agents_select ON ai.engenty_ai_agents FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_ai_agents engenty_ai_agents_update; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_ai_agents_update ON ai.engenty_ai_agents FOR UPDATE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_ai_tools; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.engenty_ai_tools ENABLE ROW LEVEL SECURITY;

--
-- Name: engenty_ai_tools engenty_ai_tools_delete; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_ai_tools_delete ON ai.engenty_ai_tools FOR DELETE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_ai_tools engenty_ai_tools_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_ai_tools_insert ON ai.engenty_ai_tools FOR INSERT WITH CHECK ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_ai_tools engenty_ai_tools_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_ai_tools_select ON ai.engenty_ai_tools FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_ai_tools engenty_ai_tools_update; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_ai_tools_update ON ai.engenty_ai_tools FOR UPDATE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_instruction_changes; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.engenty_instruction_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: engenty_instruction_changes engenty_instruction_changes_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_instruction_changes_insert ON ai.engenty_instruction_changes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ai.engenty_instruction_overrides o
  WHERE ((o.id = engenty_instruction_changes.instruction_doc_id) AND (o.tenant_id = core.current_tenant_id())))));

--
-- Name: engenty_instruction_changes engenty_instruction_changes_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_instruction_changes_select ON ai.engenty_instruction_changes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ai.engenty_instruction_overrides o
  WHERE ((o.id = engenty_instruction_changes.instruction_doc_id) AND (o.tenant_id = core.current_tenant_id())))));

--
-- Name: engenty_instruction_overrides; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.engenty_instruction_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: engenty_instruction_overrides engenty_instruction_overrides_delete; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_instruction_overrides_delete ON ai.engenty_instruction_overrides FOR DELETE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_instruction_overrides engenty_instruction_overrides_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_instruction_overrides_insert ON ai.engenty_instruction_overrides FOR INSERT WITH CHECK ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_instruction_overrides engenty_instruction_overrides_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_instruction_overrides_select ON ai.engenty_instruction_overrides FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: engenty_instruction_overrides engenty_instruction_overrides_update; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY engenty_instruction_overrides_update ON ai.engenty_instruction_overrides FOR UPDATE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: gateway_model_sync_run; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.gateway_model_sync_run ENABLE ROW LEVEL SECURITY;

--
-- Name: gateway_model_sync_settings; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.gateway_model_sync_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: model; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.model ENABLE ROW LEVEL SECURITY;

--
-- Name: model_binding; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.model_binding ENABLE ROW LEVEL SECURITY;

--
-- Name: model_pricing; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.model_pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: routine_triggers; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.routine_triggers ENABLE ROW LEVEL SECURITY;

--
-- Name: routine_triggers routine_triggers_delete; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY routine_triggers_delete ON ai.routine_triggers FOR DELETE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: routine_triggers routine_triggers_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY routine_triggers_insert ON ai.routine_triggers FOR INSERT WITH CHECK ((tenant_id = core.current_tenant_id()));

--
-- Name: routine_triggers routine_triggers_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY routine_triggers_select ON ai.routine_triggers FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: routine_triggers routine_triggers_update; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY routine_triggers_update ON ai.routine_triggers FOR UPDATE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: routines; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.routines ENABLE ROW LEVEL SECURITY;

--
-- Name: routines routines_delete; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY routines_delete ON ai.routines FOR DELETE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: routines routines_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY routines_insert ON ai.routines FOR INSERT WITH CHECK ((tenant_id = core.current_tenant_id()));

--
-- Name: routines routines_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY routines_select ON ai.routines FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: routines routines_update; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY routines_update ON ai.routines FOR UPDATE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: agent_run srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.agent_run TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: agent_run_event srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.agent_run_event TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: artifact srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.artifact TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: artifact_storage_binding srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.artifact_storage_binding TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: artifact_version srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.artifact_version TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: data_table srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.data_table TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: data_table_row srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.data_table_row TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: engenty_ai_agents srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.engenty_ai_agents TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: engenty_ai_tools srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.engenty_ai_tools TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: engenty_instruction_overrides srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.engenty_instruction_overrides TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: push_subscriptions srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.push_subscriptions TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: routine_triggers srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.routine_triggers TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: routines srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.routines TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: tenant_usage_policy srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.tenant_usage_policy TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: thread srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.thread TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: thread_agent srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.thread_agent TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: thread_message srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.thread_message TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: thread_participant srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.thread_participant TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: usage_event srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.usage_event TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: usage_period_total srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.usage_period_total TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: user_usage_policy srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.user_usage_policy TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: workflow srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.workflow TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: workflow_run srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.workflow_run TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: workflow_version srv_tenant_isolation; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY srv_tenant_isolation ON ai.workflow_version TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: tenant_usage_policy; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.tenant_usage_policy ENABLE ROW LEVEL SECURITY;

--
-- Name: thread; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.thread ENABLE ROW LEVEL SECURITY;

--
-- Name: thread_agent; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.thread_agent ENABLE ROW LEVEL SECURITY;

--
-- Name: thread_agent thread_agent_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY thread_agent_select ON ai.thread_agent FOR SELECT TO authenticated USING (((tenant_id = core.current_tenant_id()) AND ai.is_thread_member(thread_id, tenant_id)));

--
-- Name: thread thread_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY thread_insert ON ai.thread FOR INSERT TO authenticated WITH CHECK (((tenant_id = core.current_tenant_id()) AND (created_by_user_id = ((core.current_jwt() ->> 'sub'::text))::uuid)));

--
-- Name: thread_message; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.thread_message ENABLE ROW LEVEL SECURITY;

--
-- Name: thread_message thread_message_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY thread_message_insert ON ai.thread_message FOR INSERT TO authenticated WITH CHECK (((tenant_id = core.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM ai.thread_participant p
  WHERE ((p.thread_id = thread_message.thread_id) AND (p.tenant_id = thread_message.tenant_id) AND (p.principal_type = 'user'::ai.session_principal_type) AND (p.principal_id = ((core.current_jwt() ->> 'sub'::text))::uuid))))));

--
-- Name: thread_message thread_message_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY thread_message_select ON ai.thread_message FOR SELECT TO authenticated USING (((tenant_id = core.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM ai.thread_participant p
  WHERE ((p.thread_id = thread_message.thread_id) AND (p.tenant_id = thread_message.tenant_id) AND (p.principal_type = 'user'::ai.session_principal_type) AND (p.principal_id = ((core.current_jwt() ->> 'sub'::text))::uuid))))));

--
-- Name: thread_participant; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.thread_participant ENABLE ROW LEVEL SECURITY;

--
-- Name: thread_participant thread_participant_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY thread_participant_insert ON ai.thread_participant FOR INSERT TO authenticated WITH CHECK (((tenant_id = core.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM ai.thread s
  WHERE ((s.id = thread_participant.thread_id) AND (s.tenant_id = thread_participant.tenant_id) AND (s.created_by_user_id = ((core.current_jwt() ->> 'sub'::text))::uuid))))));

--
-- Name: thread_participant thread_participant_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY thread_participant_select ON ai.thread_participant FOR SELECT TO authenticated USING (((tenant_id = core.current_tenant_id()) AND ai.is_thread_member(thread_id, tenant_id)));

--
-- Name: thread thread_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY thread_select ON ai.thread FOR SELECT TO authenticated USING (((tenant_id = core.current_tenant_id()) AND (EXISTS ( SELECT 1
   FROM ai.thread_participant p
  WHERE ((p.thread_id = thread.id) AND (p.tenant_id = thread.tenant_id) AND (p.principal_type = 'user'::ai.session_principal_type) AND (p.principal_id = ((core.current_jwt() ->> 'sub'::text))::uuid))))));

--
-- Name: thread thread_update; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY thread_update ON ai.thread FOR UPDATE TO authenticated USING (((tenant_id = core.current_tenant_id()) AND (created_by_user_id = ((core.current_jwt() ->> 'sub'::text))::uuid)));

--
-- Name: usage_event; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.usage_event ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_period_total; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.usage_period_total ENABLE ROW LEVEL SECURITY;

--
-- Name: user_usage_policy; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.user_usage_policy ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.workflow ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow workflow_delete; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY workflow_delete ON ai.workflow FOR DELETE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: workflow workflow_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY workflow_insert ON ai.workflow FOR INSERT WITH CHECK ((tenant_id = core.current_tenant_id()));

--
-- Name: workflow_run; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.workflow_run ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow workflow_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY workflow_select ON ai.workflow FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: workflow workflow_update; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY workflow_update ON ai.workflow FOR UPDATE USING ((tenant_id = core.current_tenant_id()));

--
-- Name: workflow_version; Type: ROW SECURITY; Schema: ai; Owner: -
--

ALTER TABLE ai.workflow_version ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_version workflow_version_insert; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY workflow_version_insert ON ai.workflow_version FOR INSERT WITH CHECK ((tenant_id = core.current_tenant_id()));

--
-- Name: workflow_version workflow_version_select; Type: POLICY; Schema: ai; Owner: -
--

CREATE POLICY workflow_version_select ON ai.workflow_version FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: agent_goal_grants; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.agent_goal_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_goal_grants agent_goal_grants_select; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY agent_goal_grants_select ON core.agent_goal_grants FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: agents; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.agents ENABLE ROW LEVEL SECURITY;

--
-- Name: agents agents_select_own_tenant; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY agents_select_own_tenant ON core.agents FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: api_tokens; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.api_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_grants; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.approval_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_grants approval_grants_select; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY approval_grants_select ON core.approval_grants FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: approval_requests; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.approval_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_requests approval_requests_select; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY approval_requests_select ON core.approval_requests FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: audit_events; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: device_authorizations; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.device_authorizations ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_flags; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.feature_flags ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_deliveries; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.notification_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_push_subscriptions; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.notification_push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_routes; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.notification_routes ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_seen; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.notification_seen ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_seen notification_seen_select; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY notification_seen_select ON core.notification_seen FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND (user_id = auth.uid())));

--
-- Name: notification_streams; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.notification_streams ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_streams notification_streams_select; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY notification_streams_select ON core.notification_streams FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: notifications; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_select; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY notifications_select ON core.notifications FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND ((audience_kind = ANY (ARRAY['tenant'::text, 'stream'::text])) OR ((audience_kind = 'user'::text) AND (audience_id = (auth.uid())::text)) OR ((audience_kind = 'space'::text) AND (EXISTS ( SELECT 1
   FROM core.spaces s
  WHERE ((s.tenant_id = core.current_tenant_id()) AND ((s.id)::text = notifications.audience_id) AND (s.deleted_at IS NULL) AND ((s.visibility <> 'private'::text) OR (s.owner_user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM core.space_member m
          WHERE ((m.tenant_id = s.tenant_id) AND (m.space_id = s.id) AND (m.user_id = auth.uid()))))))))))));

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: role_assignments; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.role_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: role_assignments role_assignments_select; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY role_assignments_select ON core.role_assignments FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: satellites; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.satellites ENABLE ROW LEVEL SECURITY;

--
-- Name: service_credential; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.service_credential ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: space_browser_grants; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.space_browser_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: space_member; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.space_member ENABLE ROW LEVEL SECURITY;

--
-- Name: space_member space_member_select_own; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY space_member_select_own ON core.space_member FOR SELECT TO authenticated USING (((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)) AND (user_id = ( SELECT core.current_user_id() AS current_user_id))));

--
-- Name: space_mount; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.space_mount ENABLE ROW LEVEL SECURITY;

--
-- Name: space_mount space_mount_select_own_tenant; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY space_mount_select_own_tenant ON core.space_mount FOR SELECT TO authenticated USING (((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)) AND (EXISTS ( SELECT 1
   FROM core.spaces s
  WHERE (s.id = space_mount.space_id)))));

--
-- Name: spaces; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.spaces ENABLE ROW LEVEL SECURITY;

--
-- Name: spaces spaces_select_own_tenant; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY spaces_select_own_tenant ON core.spaces FOR SELECT TO authenticated USING (((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)) AND (deleted_at IS NULL) AND ((visibility = 'open'::text) OR (owner_user_id = ( SELECT core.current_user_id() AS current_user_id)) OR (EXISTS ( SELECT 1
   FROM core.space_member m
  WHERE ((m.space_id = spaces.id) AND (m.user_id = ( SELECT core.current_user_id() AS current_user_id))))))));

--
-- Name: agent_goal_grants srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.agent_goal_grants TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: agents srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.agents TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: api_tokens srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.api_tokens TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: approval_grants srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.approval_grants TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: approval_requests srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.approval_requests TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: audit_events srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.audit_events TO engenty_server USING ((tenant_id = ( SELECT (core.current_tenant_id())::text AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT (core.current_tenant_id())::text AS current_tenant_id)));

--
-- Name: feature_flags srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.feature_flags TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: invoices srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.invoices TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: notification_deliveries srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.notification_deliveries TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: notification_push_subscriptions srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.notification_push_subscriptions TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: notification_routes srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.notification_routes TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: notification_seen srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.notification_seen TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: notification_streams srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.notification_streams TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: notifications srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.notifications TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: platform_settings srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.platform_settings TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: role_assignments srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.role_assignments TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: satellites srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.satellites TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: service_credential srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.service_credential TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: sessions srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.sessions TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: space_browser_grants srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.space_browser_grants TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: space_member srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.space_member TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: space_mount srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.space_mount TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: spaces srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.spaces TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: tenant_entitlement_overrides srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.tenant_entitlement_overrides TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: tenant_plugin_overrides srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.tenant_plugin_overrides TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: tenant_roles srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.tenant_roles TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: tenant_settings srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.tenant_settings TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: user_settings srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.user_settings TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: user_tenant_roles srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.user_tenant_roles TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: users srv_tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY srv_tenant_isolation ON core.users TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: tenant_entitlement_overrides; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.tenant_entitlement_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_plugin_overrides; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.tenant_plugin_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_roles; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.tenant_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_roles tenant_roles_select; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_roles_select ON core.tenant_roles FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: tenant_settings; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.tenant_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_settings tenant_settings_insert_own_scope; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_settings_insert_own_scope ON core.tenant_settings FOR INSERT WITH CHECK (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: tenant_settings tenant_settings_read_own_scope; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_settings_read_own_scope ON core.tenant_settings FOR SELECT USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: tenant_settings tenant_settings_update_own_scope; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_settings_update_own_scope ON core.tenant_settings FOR UPDATE USING (((tenant_id = core.current_tenant_id()) AND core.has_scope(scope_id)));

--
-- Name: tenants; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants tenants_select_own; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenants_select_own ON core.tenants FOR SELECT USING ((id = core.current_tenant_id()));

--
-- Name: user_settings; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings user_settings_delete_own; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY user_settings_delete_own ON core.user_settings FOR DELETE TO authenticated USING ((user_id = ((core.current_jwt() ->> 'sub'::text))::uuid));

--
-- Name: user_settings user_settings_insert_own; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY user_settings_insert_own ON core.user_settings FOR INSERT TO authenticated WITH CHECK ((user_id = ((core.current_jwt() ->> 'sub'::text))::uuid));

--
-- Name: user_settings user_settings_select_own; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY user_settings_select_own ON core.user_settings FOR SELECT TO authenticated USING ((user_id = ((core.current_jwt() ->> 'sub'::text))::uuid));

--
-- Name: user_settings user_settings_update_own; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY user_settings_update_own ON core.user_settings FOR UPDATE TO authenticated USING ((user_id = ((core.current_jwt() ->> 'sub'::text))::uuid));

--
-- Name: user_tenant_roles; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.user_tenant_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_select_own_tenant; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY users_select_own_tenant ON core.users FOR SELECT USING ((tenant_id = core.current_tenant_id()));

--
-- Name: file_storage_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.file_storage_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: file_storage_objects srv_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY srv_tenant_isolation ON public.file_storage_objects TO engenty_server USING ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id))) WITH CHECK ((tenant_id = ( SELECT core.current_tenant_id() AS current_tenant_id)));

--
-- Name: SCHEMA ai; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA ai TO service_role;
GRANT USAGE ON SCHEMA ai TO authenticated;
GRANT USAGE ON SCHEMA ai TO engenty_server;

--
-- Name: SCHEMA core; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA core TO service_role;
GRANT USAGE ON SCHEMA core TO supabase_auth_admin;
GRANT USAGE ON SCHEMA core TO authenticated;
GRANT USAGE ON SCHEMA core TO engenty_server;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO engenty_server;

--
-- Name: FUNCTION bump_usage_period_total(p_tenant_id uuid, p_user_id uuid, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_input_tokens bigint, p_output_tokens bigint, p_cached_tokens bigint, p_reasoning_tokens bigint, p_cost_micros bigint, p_currency text, p_occurred_at timestamp with time zone, p_compute_ms bigint); Type: ACL; Schema: ai; Owner: -
--

GRANT ALL ON FUNCTION ai.bump_usage_period_total(p_tenant_id uuid, p_user_id uuid, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_input_tokens bigint, p_output_tokens bigint, p_cached_tokens bigint, p_reasoning_tokens bigint, p_cost_micros bigint, p_currency text, p_occurred_at timestamp with time zone, p_compute_ms bigint) TO service_role;

--
-- Name: FUNCTION is_thread_member(p_thread_id uuid, p_tenant_id uuid); Type: ACL; Schema: ai; Owner: -
--

REVOKE ALL ON FUNCTION ai.is_thread_member(p_thread_id uuid, p_tenant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION ai.is_thread_member(p_thread_id uuid, p_tenant_id uuid) TO authenticated;
GRANT ALL ON FUNCTION ai.is_thread_member(p_thread_id uuid, p_tenant_id uuid) TO engenty_server;

--
-- Name: TABLE thread; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.thread TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.thread TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.thread TO engenty_server;

--
-- Name: FUNCTION merge_thread_metadata(p_tenant_id uuid, p_thread_id uuid, p_user_id uuid, p_patch jsonb, p_remove_keys text[], p_append_sets jsonb); Type: ACL; Schema: ai; Owner: -
--

REVOKE ALL ON FUNCTION ai.merge_thread_metadata(p_tenant_id uuid, p_thread_id uuid, p_user_id uuid, p_patch jsonb, p_remove_keys text[], p_append_sets jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION ai.merge_thread_metadata(p_tenant_id uuid, p_thread_id uuid, p_user_id uuid, p_patch jsonb, p_remove_keys text[], p_append_sets jsonb) TO service_role;
GRANT ALL ON FUNCTION ai.merge_thread_metadata(p_tenant_id uuid, p_thread_id uuid, p_user_id uuid, p_patch jsonb, p_remove_keys text[], p_append_sets jsonb) TO engenty_server;

--
-- Name: FUNCTION upsert_thread_with_owner(p_tenant_id uuid, p_agent_id text, p_created_by_user_id uuid, p_id uuid, p_title text, p_metadata jsonb, p_route_context jsonb, p_status text, p_summary text, p_workspace_key text, p_space_id uuid); Type: ACL; Schema: ai; Owner: -
--

REVOKE ALL ON FUNCTION ai.upsert_thread_with_owner(p_tenant_id uuid, p_agent_id text, p_created_by_user_id uuid, p_id uuid, p_title text, p_metadata jsonb, p_route_context jsonb, p_status text, p_summary text, p_workspace_key text, p_space_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION ai.upsert_thread_with_owner(p_tenant_id uuid, p_agent_id text, p_created_by_user_id uuid, p_id uuid, p_title text, p_metadata jsonb, p_route_context jsonb, p_status text, p_summary text, p_workspace_key text, p_space_id uuid) TO service_role;
GRANT ALL ON FUNCTION ai.upsert_thread_with_owner(p_tenant_id uuid, p_agent_id text, p_created_by_user_id uuid, p_id uuid, p_title text, p_metadata jsonb, p_route_context jsonb, p_status text, p_summary text, p_workspace_key text, p_space_id uuid) TO engenty_server;

--
-- Name: FUNCTION custom_access_token_hook(event jsonb); Type: ACL; Schema: core; Owner: -
--

REVOKE ALL ON FUNCTION core.custom_access_token_hook(event jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION core.custom_access_token_hook(event jsonb) TO supabase_auth_admin;

--
-- Name: FUNCTION delete_space_owned_rows(p_schema text, p_table text, p_space_id uuid, p_tenant_id uuid); Type: ACL; Schema: core; Owner: -
--

REVOKE ALL ON FUNCTION core.delete_space_owned_rows(p_schema text, p_table text, p_space_id uuid, p_tenant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION core.delete_space_owned_rows(p_schema text, p_table text, p_space_id uuid, p_tenant_id uuid) TO engenty_server;
GRANT ALL ON FUNCTION core.delete_space_owned_rows(p_schema text, p_table text, p_space_id uuid, p_tenant_id uuid) TO service_role;

--
-- Name: FUNCTION deployment_self_check(); Type: ACL; Schema: core; Owner: -
--

REVOKE ALL ON FUNCTION core.deployment_self_check() FROM PUBLIC;
GRANT ALL ON FUNCTION core.deployment_self_check() TO service_role;

--
-- Name: FUNCTION ensure_default_space(); Type: ACL; Schema: core; Owner: -
--

REVOKE ALL ON FUNCTION core.ensure_default_space() FROM PUBLIC;

--
-- Name: FUNCTION ensure_personal_space(); Type: ACL; Schema: core; Owner: -
--

REVOKE ALL ON FUNCTION core.ensure_personal_space() FROM PUBLIC;

--
-- Name: FUNCTION orphan_personal_space_on_leave(); Type: ACL; Schema: core; Owner: -
--

REVOKE ALL ON FUNCTION core.orphan_personal_space_on_leave() FROM PUBLIC;

--
-- Name: FUNCTION personal_space_key(p_tenant_id uuid, p_user_id uuid); Type: ACL; Schema: core; Owner: -
--

REVOKE ALL ON FUNCTION core.personal_space_key(p_tenant_id uuid, p_user_id uuid) FROM PUBLIC;

--
-- Name: FUNCTION purge_space(p_space_id uuid, p_tenant_id uuid); Type: ACL; Schema: core; Owner: -
--

REVOKE ALL ON FUNCTION core.purge_space(p_space_id uuid, p_tenant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION core.purge_space(p_space_id uuid, p_tenant_id uuid) TO engenty_server;
GRANT ALL ON FUNCTION core.purge_space(p_space_id uuid, p_tenant_id uuid) TO service_role;

--
-- Name: FUNCTION seed_space_baseline_mounts(); Type: ACL; Schema: core; Owner: -
--

REVOKE ALL ON FUNCTION core.seed_space_baseline_mounts() FROM PUBLIC;

--
-- Name: FUNCTION space_baseline_mounts(); Type: ACL; Schema: core; Owner: -
--

GRANT ALL ON FUNCTION core.space_baseline_mounts() TO engenty_server;
GRANT ALL ON FUNCTION core.space_baseline_mounts() TO authenticated;
GRANT ALL ON FUNCTION core.space_baseline_mounts() TO service_role;

--
-- Name: FUNCTION module_invoices_count_invoices_by_client_ids(p_tenant_id uuid, p_scope_id text, p_client_ids text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.module_invoices_count_invoices_by_client_ids(p_tenant_id uuid, p_scope_id text, p_client_ids text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.module_invoices_count_invoices_by_client_ids(p_tenant_id uuid, p_scope_id text, p_client_ids text[]) TO service_role;

--
-- Name: FUNCTION pgmq_archive(queue text, msg_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pgmq_archive(queue text, msg_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pgmq_archive(queue text, msg_id bigint) TO service_role;

--
-- Name: FUNCTION pgmq_delete(queue text, msg_id bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pgmq_delete(queue text, msg_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pgmq_delete(queue text, msg_id bigint) TO service_role;

--
-- Name: FUNCTION pgmq_list_queues(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pgmq_list_queues() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pgmq_list_queues() TO service_role;

--
-- Name: FUNCTION pgmq_metrics(queue_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pgmq_metrics(queue_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pgmq_metrics(queue_name text) TO service_role;

--
-- Name: FUNCTION pgmq_peek(queue text, n integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pgmq_peek(queue text, n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pgmq_peek(queue text, n integer) TO service_role;

--
-- Name: FUNCTION pgmq_pop(queue text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pgmq_pop(queue text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pgmq_pop(queue text) TO service_role;

--
-- Name: FUNCTION pgmq_read(queue text, vt integer, n integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pgmq_read(queue text, vt integer, n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pgmq_read(queue text, vt integer, n integer) TO service_role;

--
-- Name: FUNCTION pgmq_send(queue text, msg jsonb, delay_sec integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pgmq_send(queue text, msg jsonb, delay_sec integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pgmq_send(queue text, msg jsonb, delay_sec integer) TO service_role;

--
-- Name: FUNCTION pgmq_send_batch(queue text, msgs jsonb[], delay_sec integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pgmq_send_batch(queue text, msgs jsonb[], delay_sec integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pgmq_send_batch(queue text, msgs jsonb[], delay_sec integer) TO service_role;

--
-- Name: TABLE agent_run; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.agent_run TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.agent_run TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.agent_run TO engenty_server;

--
-- Name: TABLE agent_run_event; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.agent_run_event TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.agent_run_event TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.agent_run_event TO engenty_server;

--
-- Name: TABLE artifact; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.artifact TO service_role;
GRANT SELECT ON TABLE ai.artifact TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.artifact TO engenty_server;

--
-- Name: TABLE artifact_storage_binding; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.artifact_storage_binding TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.artifact_storage_binding TO engenty_server;

--
-- Name: TABLE artifact_version; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.artifact_version TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.artifact_version TO engenty_server;

--
-- Name: TABLE data_table; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.data_table TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.data_table TO engenty_server;
GRANT SELECT ON TABLE ai.data_table TO authenticated;

--
-- Name: TABLE data_table_row; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.data_table_row TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.data_table_row TO engenty_server;
GRANT SELECT ON TABLE ai.data_table_row TO authenticated;

--
-- Name: TABLE engenty_ai_agents; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.engenty_ai_agents TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.engenty_ai_agents TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.engenty_ai_agents TO engenty_server;

--
-- Name: TABLE engenty_ai_tools; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.engenty_ai_tools TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.engenty_ai_tools TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.engenty_ai_tools TO engenty_server;

--
-- Name: TABLE engenty_instruction_changes; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.engenty_instruction_changes TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.engenty_instruction_changes TO authenticated;

--
-- Name: TABLE engenty_instruction_overrides; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.engenty_instruction_overrides TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.engenty_instruction_overrides TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.engenty_instruction_overrides TO engenty_server;

--
-- Name: TABLE gateway_model_sync_run; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.gateway_model_sync_run TO service_role;

--
-- Name: TABLE gateway_model_sync_settings; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.gateway_model_sync_settings TO service_role;

--
-- Name: TABLE model; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.model TO service_role;

--
-- Name: TABLE model_binding; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.model_binding TO service_role;

--
-- Name: TABLE model_pricing; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.model_pricing TO service_role;

--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.push_subscriptions TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.push_subscriptions TO engenty_server;

--
-- Name: TABLE routine_triggers; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.routine_triggers TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.routine_triggers TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.routine_triggers TO engenty_server;

--
-- Name: TABLE routines; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.routines TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.routines TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.routines TO engenty_server;

--
-- Name: TABLE tenant_usage_policy; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.tenant_usage_policy TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.tenant_usage_policy TO engenty_server;

--
-- Name: TABLE thread_agent; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.thread_agent TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.thread_agent TO engenty_server;
GRANT SELECT ON TABLE ai.thread_agent TO authenticated;

--
-- Name: TABLE thread_message; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.thread_message TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.thread_message TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.thread_message TO engenty_server;

--
-- Name: TABLE thread_participant; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.thread_participant TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.thread_participant TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.thread_participant TO engenty_server;

--
-- Name: TABLE usage_event; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.usage_event TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.usage_event TO engenty_server;

--
-- Name: TABLE usage_period_total; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.usage_period_total TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.usage_period_total TO engenty_server;

--
-- Name: TABLE user_usage_policy; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.user_usage_policy TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.user_usage_policy TO engenty_server;

--
-- Name: TABLE workflow; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.workflow TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.workflow TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.workflow TO engenty_server;

--
-- Name: TABLE workflow_run; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.workflow_run TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.workflow_run TO engenty_server;

--
-- Name: TABLE workflow_version; Type: ACL; Schema: ai; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.workflow_version TO service_role;
GRANT SELECT,INSERT ON TABLE ai.workflow_version TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE ai.workflow_version TO engenty_server;

--
-- Name: TABLE agent_goal_grants; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT ON TABLE core.agent_goal_grants TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.agent_goal_grants TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.agent_goal_grants TO engenty_server;

--
-- Name: TABLE agents; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.agents TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.agents TO engenty_server;

--
-- Name: TABLE api_tokens; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.api_tokens TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.api_tokens TO engenty_server;

--
-- Name: TABLE approval_grants; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.approval_grants TO service_role;
GRANT SELECT ON TABLE core.approval_grants TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.approval_grants TO engenty_server;

--
-- Name: TABLE approval_requests; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.approval_requests TO service_role;
GRANT SELECT ON TABLE core.approval_requests TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.approval_requests TO engenty_server;

--
-- Name: TABLE audit_events; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.audit_events TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.audit_events TO engenty_server;

--
-- Name: TABLE device_authorizations; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.device_authorizations TO service_role;

--
-- Name: TABLE feature_flags; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.feature_flags TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.feature_flags TO engenty_server;

--
-- Name: TABLE invoice_line_items; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.invoice_line_items TO service_role;

--
-- Name: TABLE invoices; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.invoices TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.invoices TO engenty_server;

--
-- Name: TABLE notification_deliveries; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notification_deliveries TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notification_deliveries TO engenty_server;

--
-- Name: TABLE notification_push_subscriptions; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notification_push_subscriptions TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notification_push_subscriptions TO engenty_server;

--
-- Name: TABLE notification_routes; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notification_routes TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notification_routes TO engenty_server;

--
-- Name: TABLE notification_seen; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notification_seen TO service_role;
GRANT SELECT ON TABLE core.notification_seen TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notification_seen TO engenty_server;

--
-- Name: TABLE notification_streams; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notification_streams TO service_role;
GRANT SELECT ON TABLE core.notification_streams TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notification_streams TO engenty_server;

--
-- Name: TABLE notifications; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notifications TO service_role;
GRANT SELECT ON TABLE core.notifications TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notifications TO engenty_server;

--
-- Name: TABLE packages; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.packages TO service_role;

--
-- Name: TABLE platform_settings; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.platform_settings TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.platform_settings TO engenty_server;

--
-- Name: TABLE role_assignments; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT ON TABLE core.role_assignments TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.role_assignments TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.role_assignments TO engenty_server;

--
-- Name: TABLE satellites; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.satellites TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.satellites TO engenty_server;

--
-- Name: TABLE service_credential; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.service_credential TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.service_credential TO engenty_server;

--
-- Name: TABLE sessions; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.sessions TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.sessions TO engenty_server;

--
-- Name: TABLE space_browser_grants; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.space_browser_grants TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.space_browser_grants TO engenty_server;

--
-- Name: TABLE space_member; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.space_member TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.space_member TO engenty_server;
GRANT SELECT ON TABLE core.space_member TO authenticated;

--
-- Name: TABLE space_mount; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.space_mount TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.space_mount TO engenty_server;
GRANT SELECT ON TABLE core.space_mount TO authenticated;

--
-- Name: TABLE spaces; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.spaces TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.spaces TO engenty_server;
GRANT SELECT ON TABLE core.spaces TO authenticated;

--
-- Name: TABLE tenant_entitlement_overrides; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.tenant_entitlement_overrides TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.tenant_entitlement_overrides TO engenty_server;

--
-- Name: TABLE tenant_plugin_overrides; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.tenant_plugin_overrides TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.tenant_plugin_overrides TO engenty_server;

--
-- Name: TABLE tenant_roles; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT ON TABLE core.tenant_roles TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.tenant_roles TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.tenant_roles TO engenty_server;

--
-- Name: TABLE tenant_settings; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.tenant_settings TO service_role;
GRANT SELECT ON TABLE core.tenant_settings TO supabase_auth_admin;
GRANT SELECT ON TABLE core.tenant_settings TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.tenant_settings TO engenty_server;

--
-- Name: TABLE tenants; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.tenants TO service_role;
GRANT SELECT ON TABLE core.tenants TO engenty_server;

--
-- Name: TABLE user_settings; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.user_settings TO service_role;
GRANT SELECT ON TABLE core.user_settings TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.user_settings TO engenty_server;

--
-- Name: TABLE user_tenant_roles; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.user_tenant_roles TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.user_tenant_roles TO engenty_server;

--
-- Name: TABLE users; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.users TO service_role;
GRANT SELECT ON TABLE core.users TO supabase_auth_admin;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.users TO engenty_server;

--
-- Name: TABLE file_storage_objects; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.file_storage_objects TO engenty_server;

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: ai; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA ai GRANT SELECT ON TABLES TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: core; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA core GRANT SELECT,USAGE ON SEQUENCES TO service_role;

--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: core; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA core GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO service_role;

--
--

-- Rows these migrations seeded.

SET check_function_bodies = false;

--
-- Data for Name: packages; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: users; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: spaces; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: thread; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: agent_run; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: agent_run_event; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: artifact; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: artifact_storage_binding; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: artifact_version; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: data_table; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: data_table_row; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: agents; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: engenty_ai_agents; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: engenty_ai_tools; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: engenty_instruction_overrides; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: engenty_instruction_changes; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: gateway_model_sync_run; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: gateway_model_sync_settings; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: model; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: model_binding; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: model_pricing; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: push_subscriptions; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: workflow; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: routines; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: routine_triggers; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: tenant_usage_policy; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: thread_agent; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: thread_message; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: thread_participant; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: usage_event; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: usage_period_total; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: user_usage_policy; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: workflow_version; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: workflow_run; Type: TABLE DATA; Schema: ai; Owner: postgres
--


--
-- Data for Name: agent_goal_grants; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: api_tokens; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: approval_requests; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: approval_grants; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: audit_events; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: device_authorizations; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: feature_flags; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: invoice_line_items; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: notification_deliveries; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: notification_push_subscriptions; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: notification_streams; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: notification_routes; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: notification_seen; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: user_tenant_roles; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: role_assignments; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: satellites; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: service_credential; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: space_browser_grants; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: space_member; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: space_mount; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: tenant_entitlement_overrides; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: tenant_plugin_overrides; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: tenant_roles; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: tenant_settings; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: user_settings; Type: TABLE DATA; Schema: core; Owner: postgres
--


--
-- Data for Name: file_storage_objects; Type: TABLE DATA; Schema: public; Owner: postgres
--


--
--

RESET check_function_bodies;
