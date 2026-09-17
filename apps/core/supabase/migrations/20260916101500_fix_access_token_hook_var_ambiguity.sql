-- Fix login 500: PL/pgSQL locals named tenant_id/user_id were ambiguous inside
-- the mcp_client_grants EXISTS subquery (column vs variable), so the whole
-- custom_access_token_hook failed — including normal password sign-in.
create or replace function core.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'core', 'public'
as $$
declare
  claims jsonb;
  v_user_id uuid;
  v_tenant_id uuid;
  v_oauth_client_id text;
  v_mcp_audience text;
begin
  v_user_id := coalesce(
    nullif(event ->> 'user_id', '')::uuid,
    nullif(event -> 'claims' ->> 'sub', '')::uuid
  );

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_oauth_client_id := nullif(claims ->> 'client_id', '');

  if v_user_id is not null then
    select u.tenant_id
      into v_tenant_id
      from core.users u
     where u.id = v_user_id
     limit 1;

    if v_tenant_id is not null then
      claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
      claims := jsonb_set(claims, '{scopes}', '["default"]'::jsonb);
    end if;
  end if;

  if v_oauth_client_id is not null
     and v_tenant_id is not null
     and exists (
       select 1
         from core.mcp_client_grants g
        where g.tenant_id = v_tenant_id
          and g.user_id = v_user_id
          and g.client_id = v_oauth_client_id
          and g.revoked_at is null
          and (g.expires_at is null or g.expires_at > now())
     )
  then
    select s.audience into v_mcp_audience from core.mcp_settings s where s.id = 1;
    claims := jsonb_set(
      claims,
      '{aud}',
      to_jsonb(coalesce(v_mcp_audience, 'engenty-mcp'))
    );
    claims := jsonb_set(claims, '{role}', '"agent"'::jsonb);
    claims := jsonb_set(
      claims,
      '{acting_for_user_id}',
      to_jsonb(v_user_id::text)
    );
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

revoke all on function core.custom_access_token_hook(jsonb) from public;
grant all on function core.custom_access_token_hook(jsonb) to supabase_auth_admin;
