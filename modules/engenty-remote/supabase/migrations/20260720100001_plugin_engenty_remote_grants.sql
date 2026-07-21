-- engenty-remote: grant the service_role access to module_remote.
--
-- The baseline migration created the schema + tables with RLS enabled but did
-- NOT grant the service_role usage/CRUD — so the module DAL (which uses the
-- service-role Supabase client via PostgREST) got "permission denied for schema
-- module_remote". Every other module grants this explicitly (see team-chat,
-- connections, contacts); this follow-up brings engenty-remote in line.
--
-- Covers all five tables created across the two prior migrations (bindings,
-- identities, conversations, inbound_events, pairing_requests). No authenticated
-- grants: module_remote is service-role-only in v1 (RLS with no authenticated
-- policies), so the schema is never exposed to end users directly.
--
-- NOTE for existing deployments: PostgREST must also list module_remote in its
-- exposed schemas ([api].schemas locally / the exposed-schemas config on cloud
-- Supabase) and reload — same one-time step every new module schema needs.

grant usage on schema module_remote to service_role;
grant select, insert, update, delete on all tables in schema module_remote to service_role;
alter default privileges in schema module_remote
  grant select, insert, update, delete on tables to service_role;
