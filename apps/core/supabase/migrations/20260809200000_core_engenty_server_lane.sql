-- Server-lane role for tenant-locked module connections (Phase A, PLAN-tenant-isolation-a-rls-seam.md).
--
-- The module/gateway lane stops using service_role (which has BYPASSRLS) and runs as
-- engenty_server: NOBYPASSRLS, confined per request to the tenant named in the JWT's
-- tenant_id claim by the srv_tenant_isolation policy pair generated below.
--
-- Fail-closed by design: tables WITHOUT a tenant_id column get NO grants for this role
-- (unreachable, not unprotected — same doctrine as scripts/check-grants-coverage.mjs).
-- Curated exceptions for legitimately shared reads are at the bottom.
--
-- Idempotent: safe to re-run (guarded role creation, drop-policy-if-exists, re-grants).

-- 1. Role -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'engenty_server') then
    create role engenty_server nologin nobypassrls noinherit;
  end if;
end
$$;

-- PostgREST switches to the role named in the JWT `role` claim; that requires the
-- authenticator role to be a member.
grant engenty_server to authenticator;

-- 1b. Claim helpers without the auth-schema dependency -------------------------------
-- Schema auth is owned by supabase_admin; migrations run as postgres and CANNOT grant
-- usage on it to engenty_server. Any policy whose expression reaches auth.jwt()/auth.uid()
-- therefore fails at plan time ("permission denied for schema auth") for this role —
-- and policies are OR-combined per table, so one such policy poisons the whole table.
-- Fix at the root: core-owned helpers that read the same request.jwt.claims GUC that
-- PostgREST sets for every verified request (which is all auth.jwt() does), then
-- redefine the two core helpers every policy goes through, and rewrite the few
-- policies that call auth.* directly (section 1c).

create or replace function core.current_jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function core.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(core.current_jwt() ->> 'sub', '')::uuid
$$;

-- Same semantics as before (auth.jwt() reads the identical GUC), no auth schema.
create or replace function core.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(core.current_jwt() ->> 'tenant_id', '')::uuid
$$;

create or replace function core.has_scope(p_scope_id text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(coalesce(core.current_jwt() -> 'scopes', '[]'::jsonb)) as s(scope_id)
    where s.scope_id = p_scope_id
  )
$$;

-- 1c. Rewrite policies that call auth.jwt()/auth.uid() directly -----------------------
-- Textual, semantics-preserving swap to the core helpers above; drop+recreate keeps
-- name, role list, permissiveness, and command. Guarded to exactly these two calls.

do $$
declare
  p record;
  role_list text;
  new_qual text;
  new_check text;
  ddl text;
begin
  for p in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where coalesce(qual, '') like '%auth.jwt()%'
       or coalesce(qual, '') like '%auth.uid()%'
       or coalesce(with_check, '') like '%auth.jwt()%'
       or coalesce(with_check, '') like '%auth.uid()%'
  loop
    new_qual := replace(replace(p.qual, 'auth.jwt()', 'core.current_jwt()'),
                        'auth.uid()', 'core.current_user_id()');
    new_check := replace(replace(p.with_check, 'auth.jwt()', 'core.current_jwt()'),
                         'auth.uid()', 'core.current_user_id()');
    select string_agg(quote_ident(r), ', ') into role_list from unnest(p.roles) as r(r);
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    ddl := format(
      'create policy %I on %I.%I as %s for %s to %s',
      p.policyname, p.schemaname, p.tablename,
      lower(p.permissive), lower(p.cmd), role_list
    );
    if new_qual is not null then
      ddl := ddl || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      ddl := ddl || format(' with check (%s)', new_check);
    end if;
    execute ddl;
  end loop;
end
$$;

-- 2. Schema usage ---------------------------------------------------------------------

do $$
declare
  s record;
begin
  for s in
    select nspname
    from pg_namespace
    where nspname like 'module\_%' escape '\'
       or nspname in ('core', 'ai', 'search', 'context_graph', 'public')
  loop
    execute format('grant usage on schema %I to engenty_server', s.nspname);
  end loop;
end
$$;

-- 3. Tenant tables: grants + policy pair ----------------------------------------------
-- Every table carrying tenant_id in an app schema: enable RLS (drift guard), grant CRUD,
-- and (re)create the tenant-isolation policy for this role. Browser-lane policies are
-- untouched — this pair is TO engenty_server only.

do $$
declare
  r record;
  tenant_expr text;
begin
  for r in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      t.typname as tenant_id_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
      and a.attname = 'tenant_id'
      and a.attnum > 0
      and not a.attisdropped
    join pg_type t on t.oid = a.atttypid
    where c.relkind in ('r', 'p')
      and (n.nspname like 'module\_%' escape '\'
           or n.nspname in ('core', 'ai', 'search', 'context_graph', 'public'))
  loop
    -- (select ...) wrapper => initplan-cached once per statement, not evaluated per row.
    if r.tenant_id_type = 'uuid' then
      tenant_expr := 'tenant_id = (select core.current_tenant_id())';
    else
      tenant_expr := 'tenant_id = (select core.current_tenant_id()::text)';
    end if;

    execute format('alter table %I.%I enable row level security', r.schema_name, r.table_name);
    execute format(
      'grant select, insert, update, delete on %I.%I to engenty_server',
      r.schema_name, r.table_name
    );
    execute format(
      'drop policy if exists srv_tenant_isolation on %I.%I',
      r.schema_name, r.table_name
    );
    execute format(
      'create policy srv_tenant_isolation on %I.%I as permissive for all to engenty_server using (%s) with check (%s)',
      r.schema_name, r.table_name, tenant_expr, tenant_expr
    );
  end loop;
end
$$;

-- 4. Sequences (identity/serial inserts need usage) -----------------------------------

do $$
declare
  s record;
begin
  for s in
    select nspname
    from pg_namespace
    where nspname like 'module\_%' escape '\'
       or nspname in ('core', 'ai', 'search', 'context_graph', 'public')
  loop
    execute format('grant usage, select on all sequences in schema %I to engenty_server', s.nspname);
  end loop;
end
$$;

-- 5. Curated exceptions: shared reads without tenant_id -------------------------------
-- core.tenants is keyed by id, not tenant_id; the existing PUBLIC policy
-- tenants_select_own (id = core.current_tenant_id()) confines this role to its own row.
grant select on core.tenants to engenty_server;

-- 6. SECURITY DEFINER lockdown --------------------------------------------------------
-- Definer functions run as their owner and bypass RLS, so EXECUTE is the only gate —
-- and Postgres grants EXECUTE to PUBLIC by default. Audit findings (2026-08-09):
--
-- (a) The public.pgmq_* wrapper RPCs were executable by PUBLIC — including the
--     browser's `authenticated`/`anon` roles via PostgREST (public schema is exposed).
--     Queue messages carry cross-tenant payloads; queues are core service-lane
--     infrastructure. Revoke from everyone, re-grant service_role only.
-- (b) The RLS-recursion policy helpers (ai.is_thread_member, module_projects.is_*,
--     module_team_chat.is_conversation_visible) MUST stay executable by
--     engenty_server: their browser-lane policies are TO PUBLIC and policies
--     are OR-combined, so they EVALUATE for the server lane too — a revoked
--     helper turns every query on those tables into "permission denied for
--     function" (the same OR-combination trap as auth.jwt(), caught live by
--     scripts/leak-harness.mjs). The oracle exposure is a boolean membership
--     probe, bounded and accepted; the tenant wall itself is
--     srv_tenant_isolation.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'pgmq\_%' escape '\'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from authenticated', f.sig);
    execute format('revoke all on function %s from anon', f.sig);
    execute format('revoke all on function %s from engenty_server', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;

  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and (n.nspname like 'module\_%' escape '\'
           or n.nspname in ('ai', 'search', 'context_graph'))
  loop
    execute format('grant execute on function %s to engenty_server', f.sig);
  end loop;
end
$$;

notify pgrst, 'reload schema';
