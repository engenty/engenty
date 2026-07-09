-- Phase 0.3 follow-up (caught by the RLS coverage guard): core.user_tenant_roles
-- carries tenant_id but had RLS off. It is accessed only through the core DAL
-- (service_role, which bypasses RLS) — authenticated/anon hold no grants on it.
-- Enabling RLS with no policies makes it deny-all for other roles, closing the
-- tenant-isolation gap with zero behavior change.
alter table core.user_tenant_roles enable row level security;
