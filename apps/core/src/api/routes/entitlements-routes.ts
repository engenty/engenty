import { parseEntitlementOverride } from "@engenty/entitlements";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { createPackagesDal } from "../../dal/packages.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireSuperAdmin } from "./authz.js";

/**
 * Superadmin routes for commercial-package entitlements. The catalog is
 * read-only (authored in `@engenty/entitlements`, synced to `core.packages`);
 * per-tenant assignment and sparse overrides are editable. All gated by
 * `requireSuperAdmin`. `createDal` is injectable for tests.
 */
export function registerEntitlementsRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  createDal?: typeof createPackagesDal;
}) {
  const { app, config } = params;
  const dal = (params.createDal ?? createPackagesDal)(config);

  // Read-only synced catalog.
  app.get("/api/superadmin/packages", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const packages = await dal.listPackages();
    return jsonApiSuccess(c, { packages });
  });

  // Re-sync the authored catalog (version-based upsert).
  app.post("/api/superadmin/packages/sync-defaults", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const result = await dal.syncCatalog();
    return jsonApiSuccess(c, result);
  });

  // Force every authored entry back to its catalog value.
  app.post("/api/superadmin/packages/restore-defaults", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const result = await dal.restoreDefaults();
    return jsonApiSuccess(c, result);
  });

  // Resolved entitlements for a tenant: assignment + override + composed view,
  // plus the catalog so the manage UI can render a package picker in one call.
  app.get("/api/superadmin/tenants/:id/entitlements", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const [manage, packages] = await Promise.all([
      dal.getManageData(tenantId),
      dal.listPackages(),
    ]);
    return jsonApiSuccess(c, {
      tenantId,
      packageId: manage.packageId,
      override: manage.override,
      resolved: manage.resolved,
      packages,
    });
  });

  // Assign (or clear, with packageId: null) a tenant's package.
  app.put("/api/superadmin/tenants/:id/package", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      packageId?: string | null;
    };
    const packageId =
      body.packageId === null ||
      body.packageId === undefined ||
      body.packageId === ""
        ? null
        : String(body.packageId);
    if (packageId !== null) {
      const pkg = await dal.getPackage(packageId);
      if (!pkg) {
        return jsonApiError(c, 400, {
          message: `Unknown package: ${packageId}`,
        });
      }
    }
    await dal.setTenantPackage(tenantId, packageId);
    return jsonApiSuccess(c, { tenantId, packageId });
  });

  // Replace a tenant's sparse override blob.
  app.put("/api/superadmin/tenants/:id/entitlement-override", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const raw = await c.req.json().catch(() => null);
    let override: ReturnType<typeof parseEntitlementOverride>;
    try {
      override = parseEntitlementOverride(raw ?? {});
    } catch (err) {
      return jsonApiError(c, 400, {
        message: err instanceof Error ? err.message : "Invalid override",
      });
    }
    await dal.setTenantOverride(tenantId, override);
    return jsonApiSuccess(c, { tenantId, override });
  });

  // Drop a tenant's override (revert to the package's values).
  app.delete("/api/superadmin/tenants/:id/entitlement-override", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    await dal.clearTenantOverride(tenantId);
    return jsonApiSuccess(c, { tenantId, cleared: true });
  });
}
