-- Realtime: authenticated SELECT + publication + full replica identity for the
-- company-profile live-cache signal (see
-- modules/company-profile/ui/company-profile-live-binding.ts). The settings row
-- is a tenant singleton with tenant_id + an RLS SELECT policy.

grant usage on schema module_company_profile to authenticated;

grant select on table module_company_profile.settings to authenticated;

alter table module_company_profile.settings replica identity full;

do $$
begin
  alter publication supabase_realtime add table module_company_profile.settings;
exception
  when duplicate_object then null;
end $$;
