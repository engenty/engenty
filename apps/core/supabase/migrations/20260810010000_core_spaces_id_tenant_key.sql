-- Composite key on core.spaces so module tables can bind (space_id, tenant_id)
-- (PLAN-spaces.md Phase 1).
--
-- Module DAL runs on a service-role client for some paths and on the tenant lane for
-- others, so "this task's space belongs to this task's tenant" cannot rest on
-- application code alone. A plain `space_id → core.spaces(id)` FK would happily accept
-- another tenant's space id. The composite FK the module migrations add needs this
-- unique index as its target — same recipe as `core.users (id, tenant_id)` in
-- 20260809230000.

create unique index if not exists spaces_id_tenant_key
  on core.spaces (id, tenant_id);

notify pgrst, 'reload schema';
