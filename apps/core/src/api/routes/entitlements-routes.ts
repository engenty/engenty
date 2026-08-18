import { createLogger } from "@engenty/telemetry";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { createPackagesDal } from "../../dal/packages.js";
import { entitlements } from "../../lib/entitlements-runtime.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireSuperAdmin } from "./authz.js";

/**
 * Superadmin routes for commercial-package entitlements. The authored catalog
 * seeds `core.packages` when missing; live rows are editable here. Per-tenant
 * assignment and sparse overrides are also editable. All gated by
 * `requireSuperAdmin`. `createDal` is injectable for tests.
 */
export function registerEntitlementsRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  createDal?: typeof createPackagesDal;
}) {
  if (!entitlements) {
    return;
  }
  const parseEntitlementOverride = entitlements.parseEntitlementOverride;
  const parseEntitlementPackagePatch =
    entitlements.parseEntitlementPackagePatch;
  const { app, config } = params;
  const dal = (params.createDal ?? createPackagesDal)(config);
  const logger = createLogger({ name: "entitlements" });

  /**
   * Propagate the resolved AI usage policy into the usage engine's store after
   * an entitlement change. Still non-fatal — the assignment already persisted
   * and re-running is safe — but no longer silent.
   *
   * A swallowed failure here is worse than it looks: `ai.tenant_usage_policy`
   * keeps the previous `allowed_models` while the manage UI happily shows the
   * new plan, and if the row never existed at all `managed_by` stays at its
   * `'tenant'` default, quietly handing a plan-governed policy back to the
   * tenant admin to rewrite. Callers surface `policySynced: false` so the UI can
   * say so instead of implying success.
   */
  const syncAiPolicy = async (
    tenantId: string
  ): Promise<{ error?: string; synced: boolean }> => {
    try {
      await dal.applyAiUsagePolicy(tenantId);
      return { synced: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("AI usage policy propagation failed", { tenantId, message });
      return { error: message, synced: false };
    }
  };

  // Synced catalog (operator-editable in the manage console).
  app.get("/api/superadmin/packages", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const packages = await dal.listPackages();
    return jsonApiSuccess(c, { packages });
  });

  app.get("/api/superadmin/packages/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const id = c.req.param("id");
    const pkg = await dal.getPackage(id);
    if (!pkg) {
      return jsonApiError(c, 404, { message: `Package not found: ${id}` });
    }
    return jsonApiSuccess(c, pkg);
  });

  // Operator edit of a live package row. Does not re-materialize tenants —
  // use POST …/reapply for that.
  app.patch("/api/superadmin/packages/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const id = c.req.param("id");
    const raw = await c.req.json().catch(() => null);
    let patch: ReturnType<typeof parseEntitlementPackagePatch>;
    try {
      patch = parseEntitlementPackagePatch(raw ?? {});
    } catch (err) {
      return jsonApiError(c, 400, {
        message: err instanceof Error ? err.message : "Invalid package patch",
      });
    }
    if (Object.keys(patch).length === 0) {
      return jsonApiError(c, 400, { message: "Empty package patch" });
    }
    try {
      const updated = await dal.updatePackage(id, patch);
      if (!updated) {
        return jsonApiError(c, 404, { message: `Package not found: ${id}` });
      }
      return jsonApiSuccess(c, updated);
    } catch (err) {
      return jsonApiError(c, 500, {
        message:
          err instanceof Error ? err.message : "Failed to update package",
      });
    }
  });

  // Seed missing authored catalog entries (never overwrites live edits).
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

  // Roll a package's current policy out to every tenant already assigned to it.
  // Without this, editing a package only changes what NEW assignments get.
  app.post("/api/superadmin/packages/:id/reapply", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const id = c.req.param("id");
    const pkg = await dal.getPackage(id);
    if (!pkg) {
      return jsonApiError(c, 404, { message: `Package not found: ${id}` });
    }
    const result = await dal.reapplyPackagePolicies(id);
    if (result.failures.length > 0) {
      logger.error("Package policy re-apply had failures", {
        failures: result.failures.length,
        packageId: id,
      });
    }
    return jsonApiSuccess(c, { packageId: id, ...result });
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
    const sync = await syncAiPolicy(tenantId);
    return jsonApiSuccess(c, {
      tenantId,
      packageId,
      policySynced: sync.synced,
      ...(sync.error ? { policySyncError: sync.error } : {}),
    });
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
    const sync = await syncAiPolicy(tenantId);
    return jsonApiSuccess(c, {
      tenantId,
      override,
      policySynced: sync.synced,
      ...(sync.error ? { policySyncError: sync.error } : {}),
    });
  });

  // Drop a tenant's override (revert to the package's values).
  app.delete("/api/superadmin/tenants/:id/entitlement-override", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    await dal.clearTenantOverride(tenantId);
    const sync = await syncAiPolicy(tenantId);
    return jsonApiSuccess(c, {
      tenantId,
      cleared: true,
      policySynced: sync.synced,
      ...(sync.error ? { policySyncError: sync.error } : {}),
    });
  });
}
