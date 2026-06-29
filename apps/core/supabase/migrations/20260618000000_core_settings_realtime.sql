-- Realtime for the settings live-cache (see apps/ui/src/lib/module-live-bindings.ts).
--
-- core.tenant_settings is tenant-scoped (has tenant_id) and core.user_settings is
-- user-scoped (has user_id, no tenant_id). Both already carry RLS SELECT policies
-- (tenant_settings_read_own_scope, user_settings_select_own), which realtime
-- evaluates per subscriber. The browser subscribes as the `authenticated` role,
-- which only had service_role/auth_admin grants on these tables — so it needs
-- schema usage + SELECT to receive change streams. replica identity full lets
-- DELETEs carry the filter column (tenant_id / user_id) used for matching.

grant usage on schema core to authenticated;
grant select on table core.tenant_settings to authenticated;
grant select on table core.user_settings to authenticated;

alter table core.tenant_settings replica identity full;
alter table core.user_settings replica identity full;

do $$
begin
  alter publication supabase_realtime add table core.tenant_settings;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table core.user_settings;
exception
  when duplicate_object then null;
end $$;
