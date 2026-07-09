-- Phase 0.3 follow-up (RLS coverage guard): these core tables carry tenant_id
-- but had RLS off. All three are service-role-only (no authenticated/anon
-- grants) and not realtime-published, so enabling RLS with no policies is
-- deny-all for other roles — closing the isolation gap with zero behavior
-- change. Reached only through the core API (service_role bypasses RLS).
alter table core.audit_events enable row level security;
alter table core.feature_flags enable row level security;
alter table core.tenant_plugin_overrides enable row level security;
