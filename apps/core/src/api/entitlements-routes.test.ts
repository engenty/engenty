import {
  DEFAULT_ENTITLEMENT_PACKAGES,
  type EntitlementOverride,
  resolveEntitlements,
} from "@engenty/entitlements";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type { PackagesDal } from "../dal/packages.js";
import { registerEntitlementsRoutes } from "./routes/entitlements-routes.js";

async function signToken(capabilities: string[], tenantId = "tenant-1") {
  return await new SignJWT({
    tenant_id: tenantId,
    role: "service",
    token_type: "access",
    auth_method: "oauth",
    capabilities,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("service-user")
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("test-secret"));
}

/** In-memory PackagesDal over the real authored catalog + resolver. */
function createStatefulDal(): PackagesDal {
  const catalog = DEFAULT_ENTITLEMENT_PACKAGES;
  const assignment = new Map<string, string | null>();
  const overrideByTenant = new Map<string, EntitlementOverride>();
  const findPkg = (id: string | null) =>
    id ? (catalog.find((p) => p.id === id) ?? null) : null;

  return {
    applyAiUsagePolicy: async () => {},
    reapplyPackagePolicies: async () => ({ failures: [], reapplied: 0 }),
    listPackages: async () => [...catalog],
    getPackage: async (id) => findPkg(id),
    syncCatalog: async () => ({ upserted: 0 }),
    restoreDefaults: async () => ({ restored: catalog.length }),
    getTenantPackageId: async (tenantId) => assignment.get(tenantId) ?? null,
    setTenantPackage: async (tenantId, packageId) => {
      assignment.set(tenantId, packageId);
    },
    getTenantOverride: async (tenantId) =>
      overrideByTenant.get(tenantId) ?? null,
    setTenantOverride: async (tenantId, override) => {
      overrideByTenant.set(tenantId, override);
    },
    clearTenantOverride: async (tenantId) => {
      overrideByTenant.delete(tenantId);
    },
    getResolvedEntitlements: async (tenantId) =>
      resolveEntitlements(
        findPkg(assignment.get(tenantId) ?? null),
        overrideByTenant.get(tenantId) ?? null
      ),
    getManageData: async (tenantId) => ({
      packageId: assignment.get(tenantId) ?? null,
      override: overrideByTenant.get(tenantId) ?? null,
      resolved: resolveEntitlements(
        findPkg(assignment.get(tenantId) ?? null),
        overrideByTenant.get(tenantId) ?? null
      ),
    }),
  };
}

function createApp() {
  const app = new OpenAPIHono();
  const dal = createStatefulDal();
  registerEntitlementsRoutes({
    app,
    config: {
      securityJwtSecret: "test-secret",
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseServiceRoleKey: "test-service-role",
    },
    createDal: () => dal,
  });
  return app;
}

const jsonHeaders = (token: string) => ({
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
});

describe("entitlements routes", () => {
  it("gates the catalog behind superadmin", async () => {
    const app = createApp();
    const nonAdmin = await signToken(["core.plugins.manage"]);
    expect(
      (
        await app.request("/api/superadmin/packages", {
          headers: { authorization: `Bearer ${nonAdmin}` },
        })
      ).status
    ).toBe(403);

    const admin = await signToken(["core.superadmin"]);
    const res = await app.request("/api/superadmin/packages", {
      headers: { authorization: `Bearer ${admin}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { packages: { id: string }[] } };
    expect(body.data.packages.map((p) => p.id)).toContain("team");
  });

  it("assigns a package and reflects it in the resolved entitlements", async () => {
    const app = createApp();
    const token = await signToken(["core.superadmin"]);

    await app.request("/api/superadmin/tenants/t1/package", {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify({ packageId: "team" }),
    });

    const res = await app.request("/api/superadmin/tenants/t1/entitlements", {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as {
      data: {
        packageId: string | null;
        resolved: { appLimits: { maxUsers: number | null } };
      };
    };
    expect(body.data.packageId).toBe("team");
    expect(body.data.resolved.appLimits.maxUsers).toBe(25);
  });

  it("rejects an unknown package id with 400", async () => {
    const app = createApp();
    const token = await signToken(["core.superadmin"]);
    const res = await app.request("/api/superadmin/tenants/t1/package", {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify({ packageId: "does-not-exist" }),
    });
    expect(res.status).toBe(400);
  });

  it("applies then clears a sparse override over the package", async () => {
    const app = createApp();
    const token = await signToken(["core.superadmin"]);

    await app.request("/api/superadmin/tenants/t1/package", {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify({ packageId: "team" }),
    });
    await app.request("/api/superadmin/tenants/t1/entitlement-override", {
      method: "PUT",
      headers: jsonHeaders(token),
      body: JSON.stringify({ appLimits: { maxUsers: 500 } }),
    });

    let res = await app.request("/api/superadmin/tenants/t1/entitlements", {
      headers: { authorization: `Bearer ${token}` },
    });
    let body = (await res.json()) as {
      data: { resolved: { appLimits: { maxUsers: number | null } } };
    };
    // override wins over the package's 25
    expect(body.data.resolved.appLimits.maxUsers).toBe(500);

    await app.request("/api/superadmin/tenants/t1/entitlement-override", {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    res = await app.request("/api/superadmin/tenants/t1/entitlements", {
      headers: { authorization: `Bearer ${token}` },
    });
    body = (await res.json()) as {
      data: { resolved: { appLimits: { maxUsers: number | null } } };
    };
    // reverts to the package value
    expect(body.data.resolved.appLimits.maxUsers).toBe(25);
  });

  it("rejects an invalid override payload with 400", async () => {
    const app = createApp();
    const token = await signToken(["core.superadmin"]);
    const res = await app.request(
      "/api/superadmin/tenants/t1/entitlement-override",
      {
        method: "PUT",
        headers: jsonHeaders(token),
        body: JSON.stringify({ appLimits: { enforcement_mode: "bogus" } }),
      }
    );
    expect(res.status).toBe(400);
  });
});
