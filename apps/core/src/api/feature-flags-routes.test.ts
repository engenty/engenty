import type { FeatureFlagDefinition } from "@engenty/feature-flags";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type { FeatureFlagsDal } from "../dal/feature-flags.js";
import type { PluginRegistry } from "../plugins/registry.js";
import { makeEmptyRegistry } from "../plugins/test-fixtures.js";
import { registerFeatureFlagsRoutes } from "./routes/feature-flags-routes.js";

function createRegistry(): PluginRegistry {
  return {
    ...makeEmptyRegistry(),
    featureFlags: [
      {
        pluginId: "test",
        key: "test.feature_a",
        namespace: "test",
        default: true,
      },
      {
        pluginId: "test",
        key: "test.feature_b",
        namespace: "test",
        default: false,
      },
    ],
  };
}

/** In-memory DAL: global override < tenant override, per flag key. */
function createStatefulDal(): FeatureFlagsDal {
  const overrides: Array<{
    key: string;
    tenant_id: string | null;
    enabled: boolean;
  }> = [];
  const resolveFor = (
    tenantId: string | null,
    defs: FeatureFlagDefinition[]
  ) => {
    const out: Record<string, boolean> = {};
    for (const def of defs) {
      const globalOv = overrides.find(
        (o) => o.key === def.key && o.tenant_id === null
      );
      const tenantOv =
        tenantId === null
          ? undefined
          : overrides.find(
              (o) => o.key === def.key && o.tenant_id === tenantId
            );
      out[def.key] = tenantOv?.enabled ?? globalOv?.enabled ?? def.default;
    }
    return out;
  };
  const scopedMap = (tenantId: string | null) => {
    const out: Record<string, boolean> = {};
    for (const o of overrides.filter((x) => x.tenant_id === tenantId)) {
      out[o.key] = o.enabled;
    }
    return out;
  };
  const notImplemented = () => {
    throw new Error("not implemented");
  };
  return {
    clearTenantOverride: notImplemented,
    getGlobalOverrides: notImplemented,
    getTenantOverrides: notImplemented,
    getResolved: async (tenantId, defs) => resolveFor(tenantId, defs),
    getManageData: async (tenantId, defs) => ({
      global: scopedMap(null),
      tenant: scopedMap(tenantId),
      package: {},
      resolved: resolveFor(tenantId, defs),
    }),
    setOverrides: async (updates) => {
      for (const u of updates) {
        const existing = overrides.find(
          (o) => o.key === u.key && o.tenant_id === u.tenant_id
        );
        if (existing) {
          existing.enabled = u.enabled;
        } else {
          overrides.push({ ...u });
        }
      }
    },
  };
}

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

function createApp() {
  const app = new OpenAPIHono();
  const dal = createStatefulDal();
  registerFeatureFlagsRoutes({
    app,
    registry: createRegistry(),
    config: {
      securityJwtSecret: "test-secret",
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseServiceRoleKey: "test-service-role",
    },
    createDal: () => dal,
    resolvePackageFlags: async () => ({}),
  });
  return app;
}

async function putOverrides(
  app: OpenAPIHono,
  updates: Array<{ key: string; tenant_id?: string; enabled: boolean }>
) {
  const token = await signToken(["core.superadmin"]);
  return await app.request("/api/feature-flags/manage", {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ updates }),
  });
}

describe("feature flags routes", () => {
  describe("GET /api/feature-flags/resolved", () => {
    it("returns 401 without authorization", async () => {
      const res = await createApp().request("/api/feature-flags/resolved");
      expect(res.status).toBe(401);
    });

    it("resolves flags for the caller's tenant only", async () => {
      const app = createApp();
      await putOverrides(app, [
        { key: "test.feature_b", tenant_id: "tenant-2", enabled: true },
      ]);

      const resolvedFor = async (tenantId: string) => {
        const token = await signToken(["module.read"], tenantId);
        const res = await app.request("/api/feature-flags/resolved", {
          headers: { authorization: `Bearer ${token}` },
        });
        const body = (await res.json()) as {
          data: { resolved: Record<string, boolean> };
        };
        return body.data.resolved["test.feature_b"];
      };

      expect(await resolvedFor("tenant-1")).toBe(false);
      expect(await resolvedFor("tenant-2")).toBe(true);
    });
  });

  describe("/api/feature-flags/manage", () => {
    it("GET returns 403 when not superadmin", async () => {
      const token = await signToken(["core.plugins.manage"]);
      const res = await createApp().request("/api/feature-flags/manage", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(403);
    });

    it("PUT returns 403 when not superadmin", async () => {
      const token = await signToken(["module.write"]);
      const res = await createApp().request("/api/feature-flags/manage", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ updates: [] }),
      });
      expect(res.status).toBe(403);
    });

    it("writing a tenant override shows up for that tenant, not globally", async () => {
      const app = createApp();
      await putOverrides(app, [
        { key: "test.feature_b", tenant_id: "t1", enabled: true },
      ]);

      const token = await signToken(["core.superadmin"]);
      const res = await app.request("/api/feature-flags/manage?tenantId=t1", {
        headers: { authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as {
        data: {
          global: Record<string, boolean>;
          tenant: Record<string, boolean>;
        };
      };
      expect(body.data.tenant["test.feature_b"]).toBe(true);
      expect(body.data.global).not.toHaveProperty("test.feature_b");
    });
  });
});
