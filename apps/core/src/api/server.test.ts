import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  PluginGatewayContext,
  PluginHttpRouteContext,
} from "@engenty/plugin-sdk";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { TenantPluginOverridesDal } from "../dal/tenant-plugin-overrides.js";
import type { PluginRecord, PluginRegistry } from "../plugins/registry.js";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import type { ApiLogger } from "./routes/types.js";
import {
  createApiApp,
  resolveDevPluginReloadWatcherRoots,
  shouldStartDevPluginReloadWatcher,
  startApiServer,
} from "./server.js";

/** Avoid Vitest worker teardown races with console forwarding from boot logger. */
const noopApiLogger: ApiLogger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
};

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
  } as PluginRegistry;
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

async function createUserApiToken(secret: string): Promise<string> {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "user",
    capabilities: ["module.invoices.write", "module.invoices.read"],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user-1")
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
  it("mounts plugin HTTP routes", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const app = createApiApp({
      logger: noopApiLogger,
      registry: makeRegistry(),
      config: { securityJwtSecret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides(),
    });

    const res = await app.request("/api/test?name=engenty", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { ok: true, hello: "engenty" } });
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

  it("rejects plugin HTTP routes when required dependencies are tenant-disabled", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const registry = makeRegistry();
    const owner = registry.plugins.find(
      (plugin) => plugin.id === "test-plugin"
    );
    if (!owner) {
      throw new Error("test-plugin missing from test registry");
    }
    owner.requires = ["module.dependency"];
    owner.dependencies = ["module.dependency"];
    registry.plugins.push({
      ...makePluginRecord("dependency"),
      provides: ["module.dependency"],
    });
    let handlerCalled = false;
    registry.httpRoutes[0].route.handler = async () => {
      handlerCalled = true;
      return { ok: true };
    };
    const app = createApiApp({
      logger: noopApiLogger,
      registry,
      config: { securityJwtSecret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({
        dependency: false,
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
    expect(body.error.code).toBe("dependency_disabled");
    expect(body.error.details?.reason).toBe("dependency_disabled");
    expect(handlerCalled).toBe(false);
  });

  it("supports POST/PUT/DELETE HTTP plugin routes", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const app = createApiApp({
      logger: noopApiLogger,
      registry: {
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
              method: "post",
              path: "/api/items",
              request: {
                body: z.object({ value: z.string() }),
              },
              responses: {
                201: {
                  description: "created",
                  schema: z.object({ id: z.string(), value: z.string() }),
                },
              },
              handler: async (ctx: PluginHttpRouteContext) => {
                const body = ctx.body as { value: string };
                return new Response(
                  JSON.stringify({ id: "item-1", value: body.value }),
                  {
                    status: 201,
                    headers: { "content-type": "application/json" },
                  }
                );
              },
            },
          },
          {
            pluginId: "test-plugin",
            source: "/plugins/test.ts",
            pluginConfig: {},
            route: {
              method: "put",
              path: "/api/items/:id",
              request: {
                params: z.object({ id: z.string().min(1) }),
                body: z.object({ value: z.string() }),
              },
              responses: {
                200: {
                  description: "updated",
                  schema: z.object({ id: z.string(), value: z.string() }),
                },
              },
              handler: async (ctx: PluginHttpRouteContext) => {
                const params = ctx.params as { id: string };
                const body = ctx.body as { value: string };
                return { id: params.id, value: body.value };
              },
            },
          },
          {
            pluginId: "test-plugin",
            source: "/plugins/test.ts",
            pluginConfig: {},
            route: {
              method: "delete",
              path: "/api/items/:id",
              request: {
                params: z.object({ id: z.string().min(1) }),
              },
              responses: {
                200: {
                  description: "deleted",
                  schema: z.object({ ok: z.boolean(), id: z.string() }),
                },
              },
              handler: async (ctx: PluginHttpRouteContext) => {
                const params = ctx.params as { id: string };
                return { ok: true, id: params.id };
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

    const createdRes = await app.request("/api/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value: "first" }),
    });
    expect(createdRes.status).toBe(201);
    expect(await createdRes.json()).toEqual({
      ok: true,
      data: { id: "item-1", value: "first" },
    });

    const updatedRes = await app.request("/api/items/item-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value: "updated" }),
    });
    expect(updatedRes.status).toBe(200);
    expect(await updatedRes.json()).toEqual({
      ok: true,
      data: { id: "item-1", value: "updated" },
    });

    const deletedRes = await app.request("/api/items/item-1", {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deletedRes.status).toBe(200);
    expect(await deletedRes.json()).toEqual({
      ok: true,
      data: { ok: true, id: "item-1" },
    });
  });

  it("allows high-risk plugin HTTP writes for user principals", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createUserApiToken(securityJwtSecret);
    const app = createApiApp({
      logger: noopApiLogger,
      registry: {
        plugins: [makePluginRecord("invoices")],
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
      body: JSON.stringify({ content: "updated-by-user" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { ok: true, content: "updated-by-user" },
    });
  });

  it("keeps approval requirement for service principals on high-risk writes", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const app = createApiApp({
      logger: noopApiLogger,
      registry: {
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

  it("dispatches gateway methods", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const app = createApiApp({
      logger: noopApiLogger,
      registry: makeRegistry(),
      config: { securityJwtSecret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides(),
    });

    const res = await app.request("/gateway/test_echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value: "hello" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { echoed: "hello" } });
  });

  it("returns 404 for unknown gateway method", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const app = createApiApp({
      logger: noopApiLogger,
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

  it("dispatches additional gateway CRUD-style methods", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const app = createApiApp({
      logger: noopApiLogger,
      registry: {
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
        httpRoutes: [],
        gatewayMethods: [
          {
            pluginId: "test-plugin",
            source: "/plugins/test.ts",
            pluginConfig: {},
            method: {
              name: "items_create",
              inputSchema: z.object({ value: z.string() }),
              outputSchema: z.object({ id: z.string(), value: z.string() }),
              handler: async (input: unknown, _ctx: PluginGatewayContext) => {
                const parsed = input as { value: string };
                return { id: "item-1", value: parsed.value };
              },
            },
          },
          {
            pluginId: "test-plugin",
            source: "/plugins/test.ts",
            pluginConfig: {},
            method: {
              name: "items_delete",
              inputSchema: z.object({ id: z.string() }),
              outputSchema: z.object({ deleted: z.boolean() }),
              handler: async (_input: unknown, _ctx: PluginGatewayContext) => ({
                deleted: true,
              }),
            },
          },
        ],
        moduleOperations: [
          {
            pluginId: "test-plugin",
            operationId: "items_create",
            methodName: "items_create",
            operation: {
              moduleId: "test-plugin",
              operationId: "items_create",
              requiredCapabilities: [],
              riskLevel: "medium",
              idempotent: false,
              dryRunSupported: false,
              requiresApproval: false,
            },
            inputSchema: z.object({ value: z.string() }),
            outputSchema: z.object({ id: z.string(), value: z.string() }),
            handler: async (input: unknown, _ctx: PluginGatewayContext) => {
              const parsed = input as { value: string };
              return { id: "item-1", value: parsed.value };
            },
            source: "/plugins/test.ts",
            pluginConfig: {},
          },
          {
            pluginId: "test-plugin",
            operationId: "items_delete",
            methodName: "items_delete",
            operation: {
              moduleId: "test-plugin",
              operationId: "items_delete",
              requiredCapabilities: [],
              riskLevel: "medium",
              idempotent: false,
              dryRunSupported: false,
              requiresApproval: false,
            },
            inputSchema: z.object({ id: z.string() }),
            outputSchema: z.object({ deleted: z.boolean() }),
            handler: async (_input: unknown, _ctx: PluginGatewayContext) => ({
              deleted: true,
            }),
            source: "/plugins/test.ts",
            pluginConfig: {},
          },
        ],
      },
      config: { securityJwtSecret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides(),
    });

    const createRes = await app.request("/gateway/items_create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value: "created" }),
    });
    expect(createRes.status).toBe(200);
    expect(await createRes.json()).toEqual({
      ok: true,
      data: { id: "item-1", value: "created" },
    });

    const deleteRes = await app.request("/gateway/items_delete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: "item-1" }),
    });
    expect(deleteRes.status).toBe(200);
    expect(await deleteRes.json()).toEqual({
      ok: true,
      data: { deleted: true },
    });
  });

  it("invokes app.onError when a route handler throws", async () => {
    const securityJwtSecret = "test-security-secret";
    const token = await createApiToken(securityJwtSecret);
    const app = createApiApp({
      logger: noopApiLogger,
      registry: {
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
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain("intentional test error");
  });
});

describe("dev plugin reload watcher startup", () => {
  it("gates the watcher to Engenty development environments outside production", () => {
    const originalEnv = process.env.ENV;
    const originalNodeEnv = process.env.NODE_ENV;

    try {
      delete process.env.ENV;
      process.env.NODE_ENV = "development";
      expect(shouldStartDevPluginReloadWatcher()).toBe(false);

      process.env.ENV = "development";
      expect(shouldStartDevPluginReloadWatcher()).toBe(true);
      expect(
        shouldStartDevPluginReloadWatcher({
          devPluginReloadWatcherEnabled: false,
        })
      ).toBe(false);

      process.env.NODE_ENV = "production";
      expect(shouldStartDevPluginReloadWatcher()).toBe(false);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.ENV;
      } else {
        process.env.ENV = originalEnv;
      }
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });

  it("watches only loaded module and package plugin roots", () => {
    const registry = makeRegistry();
    registry.plugins.push({
      ...makePluginRecord("tenant-settings"),
      rootDir: "/plugins/packages/tenant-settings",
      sourceType: "package",
    });
    registry.plugins.push({
      ...makePluginRecord("draft-plugin"),
      loaded: false,
      rootDir: "/plugins/draft-plugin",
    });
    registry.plugins.push({
      ...makePluginRecord("builtin-core"),
      rootDir: "/plugins/builtin-core",
      sourceType: "builtin",
    });

    expect(resolveDevPluginReloadWatcherRoots(registry)).toEqual([
      path.resolve("/plugins/packages/tenant-settings"),
      path.resolve("/plugins/test"),
    ]);
  });
});

describe("startApiServer", () => {
  it("starts HTTP server and serves requests", {
    timeout: 180_000,
    retry: 1,
  }, async () => {
    const dataDir = makeTempDir("engenty-core-start-test");
    const { app, server } = await startApiServer({
      logger: noopApiLogger,
      port: 0,
      dataDir,
      config: { securityJwtSecret: "test-secret" },
    });

    const addr = server.address();
    expect(addr).not.toBeNull();
    const port = typeof addr === "object" && addr !== null ? addr.port : 0;
    expect(port).toBeGreaterThan(0);

    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);

    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dataDir, { recursive: true, force: true });
    // This case boots a full server and cold-loads every plugin via jiti — it
    // takes ~77s locally (the suite reports import ~40-86s) and intermittently
    // crossed the old 90s budget on CI's contended runner (2 workers, apps/ai
    // running alongside). Give it real headroom, and retry once: the retry runs
    // in the same worker with the plugin modules already warm (~1s), so a slow
    // cold first attempt no longer flakes the suite.
  });

  it("does not stall boot when SUPABASE_URL is set but unreachable", {
    timeout: 30_000,
  }, async () => {
    // Mirrors CI: workflow env injects SUPABASE_* without a live instance.
    // Hydration used to fan out PostgREST calls and timeout the suite.
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
