import type { FeatureFlagDefinition } from "@engenty/feature-flags";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureFlagsDal } from "../dal/feature-flags.js";
import type { PluginRegistry } from "../plugins/registry.js";
import { registerFeatureFlagsRoutes } from "./routes/feature-flags-routes.js";

const mockFeatureFlagsDal = vi.hoisted(() => ({
  getResolved: vi.fn(),
  getManageData: vi.fn(),
  setOverrides: vi.fn(),
}));

vi.mock("../dal/feature-flags.js", () => ({
  createFeatureFlagsDal: () => mockFeatureFlagsDal,
}));

function createRegistry(
  overrides: Partial<PluginRegistry> = {}
): PluginRegistry {
  return {
    plugins: [],
    cliRegistrars: [],
    httpRoutes: [],
    gatewayMethods: [],
    moduleOperations: [],
    services: [],
    diagnostics: [],
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
    ...overrides,
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

function createApp(registry = createRegistry()) {
  const app = new OpenAPIHono();
  registerFeatureFlagsRoutes({
    app,
    registry,
    config: {
      securityJwtSecret: "test-secret",
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseServiceRoleKey: "test-service-role",
    },
    resolvePackageFlags: async () => ({}),
  });
  return app;
}

describe("feature flags routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureFlagsDal.getResolved.mockResolvedValue({});
    mockFeatureFlagsDal.getManageData.mockResolvedValue({
      global: {},
      tenant: {},
      package: {},
      resolved: {},
    });
    mockFeatureFlagsDal.setOverrides.mockResolvedValue(undefined);
  });

  describe("GET /api/feature-flags/catalog", () => {
    it("returns 401 without authorization", async () => {
      const app = createApp();
      const res = await app.request("/api/feature-flags/catalog");
      expect(res.status).toBe(401);
    });

    it("returns definitions and grouped when authenticated", async () => {
      const token = await signToken(["module.read"]);
      const app = createApp();
      const res = await app.request("/api/feature-flags/catalog", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: {
          definitions: unknown[];
          grouped: Record<string, unknown[]>;
        };
      };
      expect(body.data.definitions).toHaveLength(2);
      expect(body.data.grouped).toHaveProperty("test");
      expect(body.data.grouped.test).toHaveLength(2);
    });
  });

  describe("GET /api/feature-flags/resolved", () => {
    it("returns 401 without authorization", async () => {
      const app = createApp();
      const res = await app.request("/api/feature-flags/resolved");
      expect(res.status).toBe(401);
    });

    it("returns resolved flags when authenticated", async () => {
      const token = await signToken(["module.read"]);
      mockFeatureFlagsDal.getResolved.mockResolvedValue({
        "test.feature_a": true,
        "test.feature_b": false,
      });
      const app = createApp();
      const res = await app.request("/api/feature-flags/resolved", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { resolved: Record<string, boolean> };
      };
      expect(body.data.resolved["test.feature_a"]).toBe(true);
      expect(body.data.resolved["test.feature_b"]).toBe(false);
      expect(mockFeatureFlagsDal.getResolved).toHaveBeenCalledWith(
        "tenant-1",
        expect.any(Array),
        {}
      );
    });
  });

  describe("GET /api/feature-flags/manage", () => {
    it("returns 403 when not superadmin", async () => {
      const token = await signToken(["core.plugins.manage"]);
      const app = createApp();
      const res = await app.request("/api/feature-flags/manage", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(403);
    });

    it("returns manage data when superadmin", async () => {
      const token = await signToken(["core.superadmin"]);
      mockFeatureFlagsDal.getManageData.mockResolvedValue({
        global: { "test.feature_a": true },
        tenant: {},
        resolved: { "test.feature_a": true, "test.feature_b": false },
      });
      const app = createApp();
      const res = await app.request("/api/feature-flags/manage", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: {
          definitions: unknown[];
          global: Record<string, boolean>;
          tenant: Record<string, boolean>;
          resolved: Record<string, boolean>;
          tenantId: string | null;
        };
      };
      expect(body.data.definitions).toHaveLength(2);
      expect(body.data.global["test.feature_a"]).toBe(true);
      expect(body.data.resolved["test.feature_b"]).toBe(false);
    });
  });

  describe("PUT /api/feature-flags/manage", () => {
    it("returns 403 when not superadmin", async () => {
      const token = await signToken(["module.write"]);
      const app = createApp();
      const res = await app.request("/api/feature-flags/manage", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ updates: [] }),
      });
      expect(res.status).toBe(403);
    });

    it("calls setOverrides and returns ok when superadmin", async () => {
      const token = await signToken(["core.superadmin"]);
      const app = createApp();
      const res = await app.request("/api/feature-flags/manage", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          updates: [
            { key: "test.feature_a", enabled: false },
            { key: "test.feature_b", tenant_id: "t2", enabled: true },
          ],
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { saved: boolean } };
      expect(body.data.saved).toBe(true);
      expect(mockFeatureFlagsDal.setOverrides).toHaveBeenCalledWith([
        { key: "test.feature_a", tenant_id: null, enabled: false },
        { key: "test.feature_b", tenant_id: "t2", enabled: true },
      ]);
    });

    it("filters invalid updates", async () => {
      const token = await signToken(["core.superadmin"]);
      const app = createApp();
      const res = await app.request("/api/feature-flags/manage", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          updates: [
            { key: "valid.key", enabled: true },
            { key: "", enabled: true },
            { wrong: "shape" },
          ],
        }),
      });
      expect(res.status).toBe(200);
      expect(mockFeatureFlagsDal.setOverrides).toHaveBeenCalledWith([
        { key: "valid.key", tenant_id: null, enabled: true },
      ]);
    });
  });

  // Outcome test: a real (in-memory) DAL so a PUT is reflected by the next GET.
  describe("tenant override round-trip (stateful DAL)", () => {
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

    function createStatefulApp() {
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

    it("writing a tenant override shows up in tenant + resolved, not global", async () => {
      const token = await signToken(["core.superadmin"]);
      const headers = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      };
      const app = createStatefulApp();

      await app.request("/api/feature-flags/manage", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          updates: [{ key: "test.feature_b", tenant_id: "t1", enabled: true }],
        }),
      });

      const res = await app.request("/api/feature-flags/manage?tenantId=t1", {
        headers,
      });
      const body = (await res.json()) as {
        data: {
          global: Record<string, boolean>;
          tenant: Record<string, boolean>;
          resolved: Record<string, boolean>;
        };
      };
      expect(body.data.tenant["test.feature_b"]).toBe(true);
      expect(body.data.resolved["test.feature_b"]).toBe(true);
      expect(body.data.global).not.toHaveProperty("test.feature_b");
    });
  });
});
