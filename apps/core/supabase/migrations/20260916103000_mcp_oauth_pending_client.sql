-- Public branding for a pending OAuth authorization (client_name / logo).
-- Used by /auth/login before the user has a session — Supabase's
-- getAuthorizationDetails requires auth, but DCR already published this.
create or replace function core.mcp_oauth_pending_client(p_authorization_id text)
returns table (
  client_name text,
  logo_uri text,
  client_id uuid
)
language sql
stable
security definer
set search_path to 'auth', 'core', 'public'
as $$
  select
    nullif(trim(c.client_name), ''),
    nullif(trim(c.logo_uri), ''),
    c.id
  from auth.oauth_authorizations a
  join auth.oauth_clients c on c.id = a.client_id
  where a.authorization_id = p_authorization_id
    and a.status = 'pending'
    and a.expires_at > now()
    and c.deleted_at is null
  limit 1;
$$;

-- Thin public wrapper so anon can call via PostgREST without USAGE on core.
create or replace function public.mcp_oauth_pending_client(p_authorization_id text)
returns table (
  client_name text,
  logo_uri text,
  client_id uuid
)
language sql
stable
security definer
set search_path to 'public', 'core'
as $$
  select * from core.mcp_oauth_pending_client(p_authorization_id);
$$;

revoke all on function core.mcp_oauth_pending_client(text) from public;
grant execute on function core.mcp_oauth_pending_client(text) to service_role;

revoke all on function public.mcp_oauth_pending_client(text) from public;
grant execute on function public.mcp_oauth_pending_client(text) to anon;
grant execute on function public.mcp_oauth_pending_client(text) to authenticated;
grant execute on function public.mcp_oauth_pending_client(text) to service_role;
