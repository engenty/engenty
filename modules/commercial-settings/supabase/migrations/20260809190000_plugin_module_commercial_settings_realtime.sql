-- Realtime: authenticated SELECT + publication + full replica identity for the
-- commercial-settings live-cache signal (see
-- modules/commercial-settings/ui/commercial-settings-live-binding.ts).
--
-- Until now nothing but the editing tab learned about a write, so a change made
-- anywhere else — the copilot's commercial_settings_*_set operations, the
-- OpenAPI route, another tab — left the settings page showing stale values.
-- The row is a tenant singleton with tenant_id + scope_id and an RLS SELECT
-- policy, which Realtime evaluates per subscriber.

grant usage on schema module_commercial_settings to authenticated;

grant select on table module_commercial_settings.settings to authenticated;

alter table module_commercial_settings.settings replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_commercial_settings.settings;
exception
  when duplicate_object then null;
end $$;
