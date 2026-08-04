-- Platform-scoped service credentials (multi-tenant headless plane).
--
-- The AI runtime is platform infrastructure serving EVERY tenant, but its
-- credential was tenant-bound — so dispatched tasks, trigger reconciles and
-- actor mints for any other tenant failed at the single-tenant assertion.
-- tenant_id NULL now means "platform credential": the exchange requires the
-- caller to name a target tenant per mint and the token it signs is scoped to
-- exactly that tenant. There is never a tenant-less principal — a platform
-- credential widens WHERE a token can be minted for, not what any one token
-- can do.

alter table core.service_credential
  alter column tenant_id drop not null;

-- One live credential per (tenant, name) — platform rows (tenant_id null)
-- need their own uniqueness arm, since NULLs never collide in the composite.
create unique index if not exists service_credential_active_platform_name
  on core.service_credential (name)
  where disabled_at is null and tenant_id is null;

notify pgrst, 'reload schema';
