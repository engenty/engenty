-- Close the last three tenant-scoped tables without row-level security.
--
-- All three are service-role-only today: neither `anon` nor `authenticated`
-- holds any privilege on them, and core reaches them through the service key.
-- RLS-on with zero policies is deny-all for every other role, so this changes
-- no current behaviour — it removes the trapdoor where a later
-- `grant ... to authenticated` would silently expose every tenant's rows
-- instead of being caught by a missing policy.
--
-- Same convention as the other service-role-only tables (device_authorizations,
-- sessions, api_tokens): RLS enabled, no policies.

alter table core.invoices enable row level security;
alter table core.satellites enable row level security;
alter table core.tenant_entitlement_overrides enable row level security;
