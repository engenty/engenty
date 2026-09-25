import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import type { PluginHttpRouteContext } from "@engenty/plugin-sdk";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { TenantPluginOverridesDal } from "../dal/tenant-plugin-overrides.js";
import type { PluginRecord, PluginRegistry } from "../plugins/registry.js";
import { makeEmptyRegistry } from "../plugins/test-fixtures.js";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import { createStaticGrantsService } from "../security/grants-service.js";
import type { ApiLogger } from "./routes/types.js";
import { createApiApp, startApiServer } from "./server.js";

/** Avoid Vitest worker teardown races with console forwarding from boot logger. */
const noopApiLogger: ApiLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
};

// An injected grants service tells createApiApp not to open a database client,
// keeping every app here offline.
const offlineGrants = createStaticGrantsService({
  capabilities: ["*"],
  roleProfiles: ["agent.assistant"],
});

function makePluginRecord(id: string): PluginRecord {
  return {
    id,
    source: `/plugins/${id}.ts`,
    cliCommands: [],
    dependencies: [],
    enabled: true,
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    loaded: true,
    manifestPath: `/plugins/${id}/engenty.plugin.json`,
    moduleOperations: [],
    provides: [`module.${id}`],
    queues: [],
    requires: [],
    rootDir: `/plugins/${id}`,
    services: [],
    sourceType: "module",
    testDataTypes: [],
  };
}

function makeRegistry(): PluginRegistry {
  const registry = {
    ...makeEmptyRegistry(),
    plugins: [
      {
        id: "test-plugin",
        source: "/plugins/test.ts",
        cliCommands: [],
        dependencies: [],
        enabled: true,
        featureFlags: [],
        gatewayMethods: [],
        httpRoutes: [],
        loaded: true,
        manifestPath: "/plugins/test/engenty.plugin.json",
        moduleOperations: [],
        provides: ["module.test-plugin"],
        queues: [],
        requires: [],
        rootDir: "/plugins/test",
        services: [],
        sourceType: "module",
        testDataTypes: [],
      },
    ],
    cliRegistrars: [],
    diagnostics: [],
    services: [],
    httpRoutes: [
      {
        pluginId: "test-plugin",
        source: "/plugins/test.ts",
        pluginConfig: {},
        route: {
          method: "get",
          path: "/api/test",
          request: {
            query: z.object({ name: z.string().optional() }),
          },
          responses: {
            200: {
              description: "ok",
              schema: z.object({ ok: z.boolean(), hello: z.string() }),
            },
          },
          handler: async (ctx: PluginHttpRouteContext) => {
            const query = (ctx.query ?? {}) as { name?: string };
            return { ok: true, hello: query.name ?? "world" };
          },
        },
      },
    ],
    gatewayMethods: [
      {
        pluginId: "test-plugin",
        source: "/plugins/test.ts",
        pluginConfig: {},
        method: {
          name: "test_echo",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ echoed: z.string() }),
          handler: async (input: unknown) => {
            const parsed = input as { value: string };
            return { echoed: parsed.value };
          },
        },
      },
    ],
    moduleOperations: [
      {
        pluginId: "test-plugin",
        operationId: "test_echo",
        methodName: "test_echo",
        operation: {
          moduleId: "test-plugin",
          operationId: "test_echo",
          requiredCapabilities: [],
          riskLevel: "medium",
          idempotent: false,
          dryRunSupported: false,
          requiresApproval: false,
        },
        source: "/plugins/test.ts",
        pluginConfig: {},
      },
    ],
    // Built loose, then handlers are assigned below; the spread of the
    // shared factory makes it a superset, so the conversion needs `unknown`.
  } as unknown as PluginRegistry;
  for (const operation of registry.moduleOperations) {
    const gatewayMethod = registry.gatewayMethods.find(
      (entry) => entry.method.name === operation.methodName
    )?.method;
    if (gatewayMethod) {
      operation.handler = gatewayMethod.handler;
      operation.inputSchema = gatewayMethod.inputSchema;
      operation.outputSchema = gatewayMethod.outputSchema;
      operation.summary = gatewayMethod.summary;
      operation.description = gatewayMethod.description;
    }
  }
  return registry;
}

function createTenantPluginOverrides(
  overrides: Record<string, boolean> = {}
): TenantPluginOverridesDal {
  return {
    getOverrides: async () => overrides,
    setOverride: async (_tenantId, pluginId, enabled) => {
      overrides[pluginId] = enabled;
    },
  };
}

async function createApiToken(secret: string): Promise<string> {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "service",
    capabilities: ["*"],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("service-1")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
}

function makeTempDir(prefix: string): string {
  const dir = path.join(os.tmpdir(), `${prefix}-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("createApiApp", () => {
  it("reports readiness without generating the OpenAPI document", async () => {
    const app = createApiApp({
      logger: noopApiLogger,
      grantsService: offlineGrants,
      registry: makeRegistry(),
      config: { securityJwtSecret: "test-security-secret" },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      readiness: {
        databaseConfigured: true,
        databaseReachable: false,
      },
      tenantPluginOverrides: createTenantPluginOverrides(),
    });

    const unavailable = await app.request("/api/ready");
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({
      database_reachable: false,
      ready: false,
    });
  });

  it("rejects plugin HTTP routes for tenant-disabled owners before handler execution", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const registry = makeRegistry();
    let handlerCalled = false;
    registry.httpRoutes[0].route.handler = async () => {
      handlerCalled = true;
      return { ok: true };
    };
    const app = createApiApp({
      logger: noopApiLogger,
      grantsService: offlineGrants,
      registry,
      config: { securityJwtSecret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({
        "test-plugin": false,
      }),
    });

    const res = await app.request("/api/test?name=engenty", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: { code: string; details?: { reason?: string } };
    };
    expect(body.error.code).toBe("plugin_tenant_disabled");
    expect(body.error.details?.reason).toBe("plugin_tenant_disabled");
    expect(handlerCalled).toBe(false);
  });

  it("keeps approval requirement for service principals on high-risk writes", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const app = createApiApp({
      approvalService: createApprovalService(createFakeApprovalDb().client),
      logger: noopApiLogger,
      grantsService: offlineGrants,
      registry: {
        ...makeEmptyRegistry(),
        plugins: [
          makePluginRecord("invoices"),
          {
            id: "test-plugin",
            source: "/plugins/test.ts",
            cliCommands: [],
            dependencies: [],
            enabled: true,
            featureFlags: [],
            gatewayMethods: [],
            httpRoutes: [],
            loaded: true,
            manifestPath: "/plugins/test/engenty.plugin.json",
            moduleOperations: [],
            provides: ["module.test-plugin"],
            queues: [],
            requires: [],
            rootDir: "/plugins/test",
            services: [],
            sourceType: "module",
            testDataTypes: [],
          },
        ],
        cliRegistrars: [],
        diagnostics: [],
        services: [],
        httpRoutes: [
          {
            pluginId: "invoices",
            source: "/plugins/invoices.ts",
            pluginConfig: {},
            route: {
              method: "put",
              path: "/api/invoices/test",
              operation: {
                requiredCapabilities: ["module.invoices.write"],
                riskLevel: "high",
                requiresApproval: true,
              },
              request: {
                body: z.object({ content: z.string() }),
              },
              responses: {
                200: {
                  description: "updated",
                  schema: z.object({ ok: z.boolean(), content: z.string() }),
                },
              },
              handler: async (ctx: PluginHttpRouteContext) => {
                const body = ctx.body as { content: string };
                return { ok: true, content: body.content };
              },
            },
          },
        ],
        gatewayMethods: [],
        moduleOperations: [],
      },
      config: { securityJwtSecret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides(),
    });

    const res = await app.request("/api/invoices/test", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: "updated-by-service" }),
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      error?: { code?: string };
      ok?: boolean;
    };
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("approval_required");
  });

  it("returns 404 for unknown gateway method", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const app = createApiApp({
      logger: noopApiLogger,
      grantsService: offlineGrants,
      registry: makeRegistry(),
      config: { securityJwtSecret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides(),
    });

    const res = await app.request("/gateway/unknown.method", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("answers a throwing handler with the JSON error envelope", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const app = createApiApp({
      logger: noopApiLogger,
      grantsService: offlineGrants,
      registry: {
        ...makeEmptyRegistry(),
        plugins: [makePluginRecord("test-plugin")],
        cliRegistrars: [],
        diagnostics: [],
        services: [],
        httpRoutes: [
          {
            pluginId: "test-plugin",
            source: "/plugins/test.ts",
            pluginConfig: {},
            route: {
              method: "get",
              path: "/api/throws",
              request: {},
              responses: {
                200: {
                  description: "ok",
                  schema: z.object({ ok: z.boolean() }),
                },
              },
              handler: async () => {
                throw new Error("intentional test error");
              },
            },
          },
        ],
        gatewayMethods: [],
        moduleOperations: [],
      },
      config: { securityJwtSecret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides(),
    });

    const res = await app.request("/api/throws", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(false);
  });
});

describe("startApiServer", () => {
  // Boots the full server and cold-loads every plugin, hence the long budget
  // and one retry (the retry runs warm).
  it("closes connections and reports not-ready while draining", {
    timeout: 180_000,
    retry: 1,
  }, async () => {
    const dataDir = makeTempDir("engenty-core-start-test");
    const { beginDrain, server } = await startApiServer({
      logger: noopApiLogger,
      port: 0,
      dataDir,
      config: { securityJwtSecret: "test-secret" },
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr !== null ? addr.port : 0;

    beginDrain();
    const draining = await fetch(`http://127.0.0.1:${port}/api/ready`);
    expect(draining.status).toBe(503);
    expect(draining.headers.get("connection")).toBe("close");

    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("does not stall boot when SUPABASE_URL is set but unreachable", {
    timeout: 30_000,
  }, async () => {
    // A configured but dead Supabase must not hold the port closed.
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = "http://127.0.0.1:1";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    const dataDir = makeTempDir("engenty-core-start-unreachable");
    const started = Date.now();
    try {
      const { server } = await startApiServer({
        logger: noopApiLogger,
        port: 0,
        dataDir,
        config: { securityJwtSecret: "test-secret" },
      });
      expect(Date.now() - started).toBeLessThan(20_000);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    } finally {
      if (prevUrl === undefined) {
        Reflect.deleteProperty(process.env, "SUPABASE_URL");
      } else {
        process.env.SUPABASE_URL = prevUrl;
      }
      if (prevKey === undefined) {
        Reflect.deleteProperty(process.env, "SUPABASE_SERVICE_ROLE_KEY");
      } else {
        process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
      }
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
