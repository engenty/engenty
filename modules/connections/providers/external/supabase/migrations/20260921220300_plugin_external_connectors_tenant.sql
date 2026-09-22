-- Tenant-scoped imported connector definitions (marketplace Phase 1).
--
-- Imports used to be platform-wide (no tenant_id) and boot-registered into a
-- process-global catalog every tenant could see. Builtins stay code, not rows.

ALTER TABLE module_external_connectors.imported_connectors
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES core.tenants(id) ON DELETE CASCADE;

-- Unscoped rows were a tenancy bug; they cannot be attributed to one tenant.
DELETE FROM module_external_connectors.imported_connectors
WHERE tenant_id IS NULL;

ALTER TABLE module_external_connectors.imported_connectors
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE module_external_connectors.imported_connectors
  DROP CONSTRAINT IF EXISTS imported_connectors_pkey;
ALTER TABLE module_external_connectors.imported_connectors
  ADD CONSTRAINT imported_connectors_pkey PRIMARY KEY (tenant_id, id);

DROP INDEX IF EXISTS module_external_connectors.imported_connectors_domain_surface_key;
CREATE UNIQUE INDEX imported_connectors_tenant_domain_surface_key
  ON module_external_connectors.imported_connectors (tenant_id, domain, registry_surface_slug)
  WHERE registry_surface_slug IS NOT NULL;

DROP INDEX IF EXISTS module_external_connectors.imported_connectors_tool_prefix_key;
CREATE UNIQUE INDEX imported_connectors_tenant_tool_prefix_key
  ON module_external_connectors.imported_connectors (tenant_id, tool_prefix);

GRANT SELECT, INSERT, DELETE, UPDATE
  ON TABLE module_external_connectors.imported_connectors TO engenty_server;

DROP POLICY IF EXISTS srv_tenant_isolation
  ON module_external_connectors.imported_connectors;
CREATE POLICY srv_tenant_isolation
  ON module_external_connectors.imported_connectors
  TO engenty_server
  USING (tenant_id = (SELECT core.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT core.current_tenant_id()));

COMMENT ON COLUMN module_external_connectors.imported_connectors.tenant_id IS
  'Owning tenant. Built-in connectors are not stored here.';
