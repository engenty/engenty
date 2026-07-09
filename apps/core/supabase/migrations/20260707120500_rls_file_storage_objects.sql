-- Phase 0.3 — RLS coverage: public.file_storage_objects carries tenant_id but
-- had RLS off. It is reached only through the core file service (service_role,
-- which bypasses RLS). Enabling RLS with no policies makes it deny-all for
-- authenticated/anon — the pending_oauth_flows convention — closing the
-- isolation gap without changing any app path.
alter table public.file_storage_objects enable row level security;
