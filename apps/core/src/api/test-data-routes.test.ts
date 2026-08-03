import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PluginRegistry } from "../plugins/registry.js";
import { makeEmptyRegistry } from "../plugins/test-fixtures.js";
import { createApprovalService } from "../security/approval-service.js";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import { TestDataLlmHttpError } from "../services/test-data-generator.js";
import { registerTestDataRoutes } from "./routes/test-data-routes.js";

const mockGenerateTestData = vi.hoisted(() => vi.fn());

vi.mock("../services/test-data-generator.js", () => ({
  generateTestData: (...args: unknown[]) => mockGenerateTestData(...args),
  TestDataLlmHttpError: class TestDataLlmHttpError extends Error {
    declare readonly httpStatus: number;
    constructor(httpStatus: number, message: string) {
      super(message);
      this.name = "TestDataLlmHttpError";
      this.httpStatus = httpStatus;
    }
  },
}));

function createRegistry(
  types: PluginRegistry["testDataTypes"] = []
): PluginRegistry {
  return {
    ...makeEmptyRegistry(),
    plugins: [],
    cliRegistrars: [],
    httpRoutes: [],
    gatewayMethods: [],
    moduleOperations: [],
    services: [],
    testDataTypes: types,
    diagnostics: [],
    featureFlags: [],
    queueDefinitions: [],
    queueHandlers: new Map(),
  };
}

function createApp(registry?: PluginRegistry) {
  const app = new OpenAPIHono();
  registerTestDataRoutes({
    app,
    approvalService: createApprovalService(),
    auditLog: createNoopAuditLog(),
    config: {
      securityJwtSecret: "test-secret",
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseServiceRoleKey: "test-service-role",
    },
    dataDir: "/tmp",
    getLogger: () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    }),
    registry: registry ?? createRegistry(),
    resolvePath: (p) => p,
  });
  return app;
}

async function signSuperAdminToken(tenantId: string) {
  return await new SignJWT({
    tenant_id: tenantId,
    role: "user",
    token_type: "access",
    auth_method: "oauth",
    capabilities: ["core.superadmin"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("user-1")
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("test-secret"));
}

describe("test data routes", () => {
  beforeEach(() => {
    mockGenerateTestData.mockReset();
  });

  it("returns 401 without auth", async () => {
    const app = createApp();
    const response = await app.request("/api/test-data/types");
    expect(response.status).toBe(401);
  });

  it("returns 403 for non-superadmin", async () => {
    const token = await new SignJWT({
      tenant_id: "tenant-1",
      role: "user",
      token_type: "access",
      auth_method: "oauth",
      capabilities: ["module.read"],
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode("test-secret"));

    const app = createApp();
    const response = await app.request("/api/test-data/types", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
  });

  it("lists discovered test data types", async () => {
    const schema = z.object({
      date: z.string(),
      hours: z.number(),
      manual_project_title: z.string(),
    });
    const registry = createRegistry([
      {
        pluginId: "time-tracking",
        registration: {
          meta: {
            module_id: "time-tracking",
            data_type: "time_entries",
            description: "Time entries",
            recordSchema: schema,
            schemaDescription: "date, hours, manual_project_title",
          },
          persist: async () => 0,
        },
        source: "/modules/time-tracking",
        pluginConfig: {},
      },
    ]);
    const app = createApp(registry);
    const token = await signSuperAdminToken("tenant-1");
    const response = await app.request("/api/test-data/types", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; data: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      module_id: "time-tracking",
      data_type: "time_entries",
    });
  });

  it("returns types as array in envelope data for client unwrapping", async () => {
    const registry = createRegistry([
      {
        pluginId: "team",
        registration: {
          meta: {
            module_id: "team",
            data_type: "team",
            description: "Team member records",
            recordSchema: z.object({ full_name: z.string() }),
            schemaDescription: "full_name",
          },
          persist: async () => 0,
        },
        source: "/modules/team",
        pluginConfig: {},
      },
    ]);
    const app = createApp(registry);
    const token = await signSuperAdminToken("tenant-1");
    const response = await app.request("/api/test-data/types", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; data: unknown };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    const typeList = Array.isArray(body.data) ? body.data : [];
    expect(typeList).toHaveLength(1);
    expect(typeList[0]).toMatchObject({
      module_id: "team",
      data_type: "team",
    });
  });

  it("returns 404 for unknown module:data_type on generate-preview", async () => {
    const app = createApp();
    const token = await signSuperAdminToken("tenant-1");
    const response = await app.request("/api/test-data/generate-preview", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        module_id: "unknown",
        data_type: "foo",
        count: 5,
      }),
    });
    expect(response.status).toBe(404);
    expect(mockGenerateTestData).not.toHaveBeenCalled();
  });

  it("returns 429 when the LLM rate limits", async () => {
    mockGenerateTestData.mockRejectedValue(
      new TestDataLlmHttpError(429, "LLM API error: 429")
    );
    const schema = z.object({ full_name: z.string() });
    const registry = createRegistry([
      {
        pluginId: "team",
        registration: {
          meta: {
            module_id: "team",
            data_type: "team",
            description: "Members",
            recordSchema: schema,
            schemaDescription: "full_name",
          },
          persist: async () => 0,
        },
        source: "/modules/team",
        pluginConfig: {},
      },
    ]);
    const app = createApp(registry);
    const token = await signSuperAdminToken("tenant-1");
    const response = await app.request("/api/test-data/generate-preview", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        module_id: "team",
        data_type: "team",
        count: 1,
        tenant_id: "tenant-1",
      }),
    });
    expect(response.status).toBe(429);
    const body = (await response.json()) as {
      ok: boolean;
      error?: { code?: string; message?: string };
    };
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("rate_limited");
    expect(body.error?.message).toContain("rate-limit");
  });

  it("uses registration normalizeInput before invoking createOperationId", async () => {
    const received: Record<string, unknown>[] = [];
    const registry = createRegistry([
      {
        pluginId: "contacts",
        registration: {
          meta: {
            module_id: "contacts",
            data_type: "contacts",
            description: "Contacts",
            createOperationId: "contacts_create",
            recordSchema: z.object({ display_name: z.string() }),
            schemaDescription: "display_name",
          },
          normalizeInput: (record, ctx) => ({
            ...record,
            created_by: ctx.principalId,
          }),
          persist: async () => 0,
        },
        source: "/modules/contacts",
        pluginConfig: {},
      },
    ]);
    registry.plugins.push({
      id: "contacts",
      source: "/modules/contacts/index.ts",
      cliCommands: [],
      dependencies: [],
      enabled: true,
      featureFlags: [],
      gatewayMethods: [],
      httpRoutes: [],
      loaded: true,
      manifestPath: "/modules/contacts/engenty.plugin.json",
      moduleOperations: [],
      provides: ["module.contacts"],
      queues: [],
      requires: [],
      rootDir: "/modules/contacts",
      services: [],
      sourceType: "module",
      testDataTypes: [],
    });
    registry.gatewayMethods.push({
      pluginId: "contacts",
      source: "/modules/contacts/index.ts",
      pluginConfig: {},
      method: {
        name: "contacts_create",
        operation: {
          moduleId: "contacts",
          operationId: "contacts_create",
          requiredCapabilities: [],
          riskLevel: "low",
          idempotent: false,
          dryRunSupported: false,
          requiresApproval: false,
        },
        inputSchema: z.object({
          display_name: z.string(),
          created_by: z.string(),
        }),
        outputSchema: z.object({
          ok: z.boolean(),
        }),
        handler: async (input) => {
          received.push(input as Record<string, unknown>);
          return { ok: true };
        },
      },
    });
    registry.moduleOperations.push({
      pluginId: "contacts",
      operationId: "contacts_create",
      methodName: "contacts_create",
      operation: {
        moduleId: "contacts",
        operationId: "contacts_create",
        requiredCapabilities: [],
        riskLevel: "low",
        idempotent: false,
        dryRunSupported: false,
        requiresApproval: false,
      },
      inputSchema: z.object({
        display_name: z.string(),
        created_by: z.string(),
      }),
      outputSchema: z.object({
        ok: z.boolean(),
      }),
      handler: async (input) => {
        received.push(input as Record<string, unknown>);
        return { ok: true };
      },
      source: "/modules/contacts/index.ts",
      pluginConfig: {},
    });

    const app = createApp(registry);
    const token = await signSuperAdminToken("tenant-1");
    const response = await app.request("/api/test-data/apply", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        module_id: "contacts",
        data_type: "contacts",
        tenant_id: "tenant-1",
        records: [{ display_name: "Acme" }],
      }),
    });

    expect(response.status).toBe(200);
    expect(received).toEqual([{ display_name: "Acme", created_by: "user-1" }]);
  });
});
