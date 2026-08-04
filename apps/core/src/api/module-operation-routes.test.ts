import { ENGENTY_API_CATALOG_TOOL_ID } from "@engenty/ai-core";
import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import type {
  PluginHttpRouteContext,
  PluginPolicyInput,
} from "@engenty/plugin-sdk";
import { createPluginEventsRuntime } from "@engenty/plugin-sdk";
import { z } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type { TenantPluginOverridesDal } from "../dal/tenant-plugin-overrides.js";
import {
  createPluginRegistry,
  type PluginRecord,
  type PluginRegistry,
} from "../plugins/registry.js";
import { makeEmptyRegistry } from "../plugins/test-fixtures.js";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import { createApiApp } from "./server.js";

async function createToken(
  secret: string,
  params: {
    capabilities: string[];
    roleProfiles?: string[];
    moduleIds?: string[];
  }
): Promise<string> {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "agent",
    capabilities: params.capabilities,
    role_profiles: params.roleProfiles ?? [],
    module_ids: params.moduleIds ?? [],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("agent-1")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
}

function makeRegistry(): PluginRegistry {
  const currentYear = new Date().getUTCFullYear();
  const lastYear = currentYear - 1;
  const currentInvoice = {
    id: "inv-current",
    number: "INV-CURRENT",
    date: `${currentYear}-01-10`,
  };
  const oldInvoice = {
    id: "inv-old",
    number: "INV-OLD",
    date: `${lastYear}-12-20`,
  };
  const registry = {
    ...makeEmptyRegistry(),
    plugins: [
      {
        id: "invoices",
        source: "/modules/invoices/index.ts",
        cliCommands: [],
        dependencies: [],
        enabled: true,
        featureFlags: [],
        gatewayMethods: [],
        httpRoutes: [],
        loaded: true,
        manifestPath: "/modules/invoices/engenty.plugin.json",
        moduleOperations: [],
        optional: ["module.contacts"],
        provides: ["module.invoices"],
        queues: [],
        requires: [],
        rootDir: "/modules/invoices",
        services: [],
        sourceType: "module",
        testDataTypes: [],
      },
      {
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
      },
    ],
    cliRegistrars: [],
    diagnostics: [],
    profilePolicies: [
      {
        pluginId: "contacts",
        source: "/modules/contacts/index.ts",
        pluginConfig: {},
        policy: (input: PluginPolicyInput) => {
          const isWrite =
            input.requiredCapabilities.some((capability: string) =>
              capability.includes(".write")
            ) ||
            [".create", ".update", ".delete", ".upsert", ".write"].some(
              (suffix) => input.operationId.toLowerCase().includes(suffix)
            );

          if (
            input.auth.roleProfiles.includes(
              "invoices_crud_connect_contacts"
            ) &&
            input.moduleId === "contacts" &&
            isWrite
          ) {
            return {
              action: "deny" as const,
              reason:
                "profile invoices_crud_connect_contacts cannot modify contacts",
            };
          }

          if (
            input.auth.roleProfiles.includes("contacts_with_invoices_viewer") &&
            input.moduleId === "contacts" &&
            isWrite
          ) {
            return {
              action: "deny" as const,
              reason: "profile contacts_with_invoices_viewer is read-only",
            };
          }

          return null;
        },
      },
      {
        pluginId: "invoices",
        source: "/modules/invoices/index.ts",
        pluginConfig: {},
        policy: (input: PluginPolicyInput) => {
          const isWrite =
            input.requiredCapabilities.some((capability: string) =>
              capability.includes(".write")
            ) ||
            [".create", ".update", ".delete", ".upsert", ".write"].some(
              (suffix) => input.operationId.toLowerCase().includes(suffix)
            );

          if (
            input.auth.roleProfiles.includes("contacts_with_invoices_viewer") &&
            input.moduleId === "invoices" &&
            isWrite
          ) {
            return {
              action: "deny" as const,
              reason: "profile contacts_with_invoices_viewer is read-only",
            };
          }

          if (
            !input.auth.roleProfiles.includes("invoices_current_year_reader")
          ) {
            return null;
          }

          if (input.moduleId !== "invoices") {
            return {
              action: "deny" as const,
              reason:
                "profile invoices_current_year_reader limited to invoices module",
            };
          }

          if (isWrite) {
            return {
              action: "deny" as const,
              reason:
                "profile invoices_current_year_reader cannot write invoices",
            };
          }

          const payload =
            input.input && typeof input.input === "object"
              ? (input.input as Record<string, unknown>)
              : {};
          const query =
            payload.query && typeof payload.query === "object"
              ? (payload.query as Record<string, unknown>)
              : {};
          const body =
            payload.body && typeof payload.body === "object"
              ? (payload.body as Record<string, unknown>)
              : {};
          const directYear =
            typeof payload.year === "number"
              ? payload.year
              : typeof query.year === "number"
                ? query.year
                : typeof body.year === "number"
                  ? body.year
                  : null;
          const extractYear = (value: unknown) => {
            if (typeof value !== "string") {
              return null;
            }
            const match = value.match(/^(\d{4})/);
            if (!match) {
              return null;
            }
            const year = Number(match[1]);
            return Number.isFinite(year) ? year : null;
          };
          const fromYear = extractYear(payload.from ?? query.from ?? body.from);
          const toYear = extractYear(payload.to ?? query.to ?? body.to);

          if (directYear !== null && directYear !== currentYear) {
            return {
              action: "deny" as const,
              reason: "invoice access restricted to current year",
            };
          }
          if (fromYear !== null && fromYear !== currentYear) {
            return {
              action: "deny" as const,
              reason: "invoice access restricted to current year",
            };
          }
          if (toYear !== null && toYear !== currentYear) {
            return {
              action: "deny" as const,
              reason: "invoice access restricted to current year",
            };
          }

          return null;
        },
      },
    ],
    resultPolicies: [
      {
        pluginId: "invoices",
        source: "/modules/invoices/index.ts",
        pluginConfig: {},
        policy: (input: PluginPolicyInput, result: unknown) => {
          const isWrite =
            input.requiredCapabilities.some((capability: string) =>
              capability.includes(".write")
            ) ||
            [".create", ".update", ".delete", ".upsert", ".write"].some(
              (suffix) => input.operationId.toLowerCase().includes(suffix)
            );

          if (
            input.moduleId !== "invoices" ||
            !input.auth.roleProfiles.includes("invoices_current_year_reader") ||
            isWrite
          ) {
            return null;
          }

          const dates = Array.isArray(result)
            ? result
                .map((item) =>
                  item && typeof item === "object"
                    ? (item as { date?: unknown }).date
                    : undefined
                )
                .filter((date): date is string => typeof date === "string")
            : typeof result === "object" && result
              ? typeof (result as { date?: unknown }).date === "string"
                ? [(result as { date: string }).date]
                : []
              : [];
          const invalid = dates.some(
            (date) => !date.startsWith(`${currentYear}`)
          );

          return invalid
            ? {
                action: "deny" as const,
                reason: "invoice access restricted to current year",
              }
            : null;
        },
      },
    ],
    services: [],
    httpRoutes: [
      {
        pluginId: "invoices",
        source: "/modules/invoices/index.ts",
        pluginConfig: {},
        route: {
          method: "get",
          path: "/api/invoices",
          operation: {
            moduleId: "invoices",
            operationId: "invoices_list",
            requiredCapabilities: ["module.invoices.read"],
            riskLevel: "low",
          },
          request: {
            query: z.object({ year: z.coerce.number().optional() }),
          },
          responses: {
            200: {
              description: "ok",
              schema: z.array(
                z.object({
                  id: z.string(),
                  number: z.string(),
                  date: z.string(),
                })
              ),
            },
          },
          handler: async (ctx: PluginHttpRouteContext) => {
            const query = (ctx.query ?? {}) as { year?: number };
            if (query.year === currentYear) {
              return [currentInvoice];
            }
            if (query.year === lastYear) {
              return [oldInvoice];
            }
            return [currentInvoice, oldInvoice];
          },
        },
      },
      {
        pluginId: "contacts",
        source: "/modules/contacts/index.ts",
        pluginConfig: {},
        route: {
          method: "post",
          path: "/api/contacts",
          operation: {
            moduleId: "contacts",
            operationId: "contacts_create",
            requiredCapabilities: ["module.contacts.write"],
            riskLevel: "high",
            requiresApproval: true,
          },
          request: {
            body: z.object({ display_name: z.string() }),
          },
          responses: {
            201: {
              description: "created",
              schema: z.object({ id: z.string(), display_name: z.string() }),
            },
          },
          handler: async (ctx: PluginHttpRouteContext) => {
            const body = ctx.body as { display_name: string };
            return new Response(
              JSON.stringify({ id: "c-new", display_name: body.display_name }),
              {
                status: 201,
                headers: { "content-type": "application/json" },
              }
            );
          },
        },
      },
    ],
    gatewayMethods: [
      {
        pluginId: "invoices",
        source: "/modules/invoices/index.ts",
        pluginConfig: {},
        method: {
          name: "invoices_list",
          operation: {
            moduleId: "invoices",
            operationId: "invoices_list",
            requiredCapabilities: ["module.invoices.read"],
            riskLevel: "low",
            idempotent: true,
          },
          inputSchema: z.object({ year: z.number().optional() }),
          handler: async (input: unknown) => {
            const payload = input as { year?: number };
            if (payload.year === currentYear) {
              return [currentInvoice];
            }
            if (payload.year === lastYear) {
              return [oldInvoice];
            }
            return [currentInvoice, oldInvoice];
          },
        },
      },
      {
        pluginId: "invoices",
        source: "/modules/invoices/index.ts",
        pluginConfig: {},
        method: {
          name: "invoices_get",
          operation: {
            moduleId: "invoices",
            operationId: "invoices_get",
            requiredCapabilities: ["module.invoices.read"],
            riskLevel: "low",
            idempotent: true,
          },
          inputSchema: z.object({ idOrNumber: z.string() }),
          handler: async (input: unknown) => {
            const payload = input as { idOrNumber: string };
            if (payload.idOrNumber === "inv-current") {
              return currentInvoice;
            }
            if (payload.idOrNumber === "inv-old") {
              return oldInvoice;
            }
            return null;
          },
        },
      },
      {
        pluginId: "invoices",
        source: "/modules/invoices/index.ts",
        pluginConfig: {},
        method: {
          name: "invoices_create",
          operation: {
            moduleId: "invoices",
            operationId: "invoices_create",
            requiredCapabilities: ["module.invoices.write"],
            riskLevel: "high",
            requiresApproval: true,
          },
          inputSchema: z.object({ number: z.string() }),
          handler: async () => ({ id: "inv-new" }),
        },
      },
      {
        pluginId: "contacts",
        source: "/modules/contacts/index.ts",
        pluginConfig: {},
        method: {
          name: "contacts_list",
          operation: {
            moduleId: "contacts",
            operationId: "contacts_list",
            requiredCapabilities: ["module.contacts.read"],
            riskLevel: "low",
            idempotent: true,
          },
          handler: async () => [{ id: "c1" }],
        },
      },
      {
        pluginId: "contacts",
        source: "/modules/contacts/index.ts",
        pluginConfig: {},
        method: {
          name: "contacts_get",
          operation: {
            moduleId: "contacts",
            operationId: "contacts_get",
            requiredCapabilities: ["module.contacts.read"],
            riskLevel: "low",
            idempotent: true,
          },
          inputSchema: z.object({ id: z.string() }),
          handler: async () => ({ id: "c1", display_name: "Acme" }),
        },
      },
      {
        pluginId: "contacts",
        source: "/modules/contacts/index.ts",
        pluginConfig: {},
        method: {
          name: "contacts_delete",
          operation: {
            moduleId: "contacts",
            operationId: "contacts_delete",
            requiredCapabilities: ["module.contacts.write"],
            riskLevel: "critical",
            requiresApproval: true,
          },
          handler: async () => ({ deleted: true }),
        },
      },
      {
        pluginId: "contacts",
        source: "/modules/contacts/index.ts",
        pluginConfig: {},
        method: {
          name: "contacts_create",
          operation: {
            moduleId: "contacts",
            operationId: "contacts_create",
            requiredCapabilities: ["module.contacts.write"],
            riskLevel: "high",
            requiresApproval: true,
          },
          inputSchema: z.object({ name: z.string() }),
          handler: async () => ({ id: "c2" }),
        },
      },
    ],
    moduleOperations: [
      {
        pluginId: "invoices",
        operationId: "invoices_list",
        methodName: "invoices_list",
        operation: {
          moduleId: "invoices",
          operationId: "invoices_list",
          requiredCapabilities: ["module.invoices.read"],
          riskLevel: "low",
          idempotent: true,
          dryRunSupported: false,
          requiresApproval: false,
        },
        source: "/modules/invoices/index.ts",
        pluginConfig: {},
      },
      {
        pluginId: "invoices",
        operationId: "invoices_get",
        methodName: "invoices_get",
        operation: {
          moduleId: "invoices",
          operationId: "invoices_get",
          requiredCapabilities: ["module.invoices.read"],
          riskLevel: "low",
          idempotent: true,
          dryRunSupported: false,
          requiresApproval: false,
        },
        source: "/modules/invoices/index.ts",
        pluginConfig: {},
      },
      {
        pluginId: "invoices",
        operationId: "invoices_create",
        methodName: "invoices_create",
        operation: {
          moduleId: "invoices",
          operationId: "invoices_create",
          requiredCapabilities: ["module.invoices.write"],
          riskLevel: "high",
          idempotent: false,
          dryRunSupported: false,
          requiresApproval: true,
        },
        source: "/modules/invoices/index.ts",
        pluginConfig: {},
      },
      {
        pluginId: "contacts",
        operationId: "contacts_list",
        methodName: "contacts_list",
        operation: {
          moduleId: "contacts",
          operationId: "contacts_list",
          requiredCapabilities: ["module.contacts.read"],
          riskLevel: "low",
          idempotent: true,
          dryRunSupported: false,
          requiresApproval: false,
        },
        source: "/modules/contacts/index.ts",
        pluginConfig: {},
      },
      {
        pluginId: "contacts",
        operationId: "contacts_get",
        methodName: "contacts_get",
        operation: {
          moduleId: "contacts",
          operationId: "contacts_get",
          requiredCapabilities: ["module.contacts.read"],
          riskLevel: "low",
          idempotent: true,
          dryRunSupported: false,
          requiresApproval: false,
        },
        source: "/modules/contacts/index.ts",
        pluginConfig: {},
      },
      {
        pluginId: "contacts",
        operationId: "contacts_delete",
        methodName: "contacts_delete",
        operation: {
          moduleId: "contacts",
          operationId: "contacts_delete",
          requiredCapabilities: ["module.contacts.write"],
          riskLevel: "critical",
          idempotent: false,
          dryRunSupported: false,
          requiresApproval: true,
        },
        source: "/modules/contacts/index.ts",
        pluginConfig: {},
      },
      {
        pluginId: "contacts",
        operationId: "contacts_create",
        methodName: "contacts_create",
        operation: {
          moduleId: "contacts",
          operationId: "contacts_create",
          requiredCapabilities: ["module.contacts.write"],
          riskLevel: "high",
          idempotent: false,
          dryRunSupported: false,
          requiresApproval: true,
        },
        source: "/modules/contacts/index.ts",
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
  overrides: Record<string, boolean>
): TenantPluginOverridesDal {
  return {
    getOverrides: async () => overrides,
    setOverride: async (_tenantId, pluginId, enabled) => {
      overrides[pluginId] = enabled;
    },
  };
}

describe("module operation routes", () => {
  it("invokes core gateway methods without a core plugin record", async () => {
    const secret = "test-security-secret";
    const { registry } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });
    expect(registry.plugins.some((plugin) => plugin.id === "core")).toBe(false);
    const token = await createToken(secret, { capabilities: [] });
    const app = createApiApp({
      registry,
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });

    const gatewayResponse = await app.request(
      `/gateway/${ENGENTY_API_CATALOG_TOOL_ID}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: "contacts", limit: 5 }),
      }
    );

    expect(gatewayResponse.status).toBe(200);
    await expect(gatewayResponse.json()).resolves.toMatchObject({
      data: {
        matches: expect.any(Array),
        total: expect.any(Number),
      },
    });
  });

  it("invokes server operations without gateway method registrations", async () => {
    const secret = "test-security-secret";
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });
    const record: PluginRecord = {
      id: "direct",
      source: "/modules/direct/src/plugin.ts",
      cliCommands: [],
      dependencies: [],
      enabled: true,
      featureFlags: [],
      gatewayMethods: [],
      httpRoutes: [],
      loaded: true,
      manifestPath: "/modules/direct/engenty.plugin.json",
      moduleOperations: [],
      provides: ["module.direct"],
      queues: [],
      requires: [],
      rootDir: "/modules/direct",
      services: [],
      sourceType: "module",
      testDataTypes: [],
    };
    registry.plugins.push(record);
    createApi(record, {}).server.registerOperation({
      operationId: "direct_echo",
      inputSchema: z.object({ value: z.string() }),
      outputSchema: z.object({ echoed: z.string() }),
      handler: async (input: unknown) => {
        const payload = input as { value: string };
        return { echoed: payload.value };
      },
    });

    expect(registry.gatewayMethods).toHaveLength(0);
    const token = await createToken(secret, { capabilities: [] });
    const app = createApiApp({
      registry,
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });

    const contractResponse = await app.request(
      "/api/tools/contracts/direct_echo",
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }
    );
    expect(contractResponse.status).toBe(200);
    const contractBody = (await contractResponse.json()) as {
      ok: true;
      data: {
        inputSchema: { jsonSchema?: Record<string, unknown> };
        outputSchema: { jsonSchema?: Record<string, unknown> };
      };
    };
    expect(contractBody.data.inputSchema.jsonSchema).toMatchObject({
      type: "object",
      properties: {
        value: { type: "string" },
      },
      required: ["value"],
    });
    expect(contractBody.data.outputSchema.jsonSchema).toMatchObject({
      type: "object",
      properties: {
        echoed: { type: "string" },
      },
      required: ["echoed"],
    });

    const operationResponse = await app.request(
      "/api/operations/direct_echo/invoke",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ input: { value: "operation" } }),
      }
    );
    expect(operationResponse.status).toBe(200);
    await expect(operationResponse.json()).resolves.toMatchObject({
      data: { echoed: "operation" },
    });

    const gatewayResponse = await app.request("/gateway/direct_echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value: "gateway" }),
    });
    expect(gatewayResponse.status).toBe(200);
    await expect(gatewayResponse.json()).resolves.toMatchObject({
      data: { echoed: "gateway" },
    });
  });

  // Regression: engenty-apps app_call_privileged returned domain-cased
  // { appId } against an output schema requiring { app_id }; the resulting
  // ZodError fell into the generic 400 "validation_error" formatter and read
  // as broken INPUT validation on /api/tools/app_call_privileged/invoke,
  // sending the diagnosis to the wrong layer. An output-contract breach is
  // the module's defect, so it must surface as a 500 naming the real cause.
  it("reports an output-schema mismatch as a 500 contract violation, not input validation", async () => {
    const secret = "test-security-secret";
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });
    const record: PluginRecord = {
      id: "direct",
      source: "/modules/direct/src/plugin.ts",
      cliCommands: [],
      dependencies: [],
      enabled: true,
      featureFlags: [],
      gatewayMethods: [],
      httpRoutes: [],
      loaded: true,
      manifestPath: "/modules/direct/engenty.plugin.json",
      moduleOperations: [],
      provides: ["module.direct"],
      queues: [],
      requires: [],
      rootDir: "/modules/direct",
      services: [],
      sourceType: "module",
      testDataTypes: [],
    };
    registry.plugins.push(record);
    createApi(record, {}).server.registerOperation({
      operationId: "direct_breaker",
      inputSchema: z.object({ value: z.string() }),
      outputSchema: z.object({ app_id: z.string() }),
      // Domain-cased key where the contract requires snake_case.
      handler: async () => ({ appId: "not-the-declared-shape" }),
    });

    const token = await createToken(secret, { capabilities: [] });
    const app = createApiApp({
      registry,
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });

    const response = await app.request("/api/tools/direct_breaker/invoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ input: { value: "valid input" } }),
    });

    expect(response.status).toBe(500);
    const body = (await response.json()) as {
      ok: false;
      error: { code: string; fields?: Record<string, string[]> };
    };
    expect(body.error.code).toBe("output_contract_violation");
    expect(body.error.fields).toHaveProperty("app_id");

    // Bad INPUT keeps the 400 validation_error shape.
    const badInput = await app.request("/api/tools/direct_breaker/invoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ input: { value: 42 } }),
    });
    expect(badInput.status).toBe(400);
    const badInputBody = (await badInput.json()) as {
      ok: false;
      error: { code: string };
    };
    expect(badInputBody.error.code).toBe("validation_error");
  });

  it("dispatches core operation events around operation execution", async () => {
    const secret = "test-security-secret";
    const { registry, createApi } = createPluginRegistry({
      config: {},
      dataDir: "/tmp",
      resolvePath: (p) => p,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });
    registry.eventsRuntime = createPluginEventsRuntime({
      bridgeModuleEventsToAutomationHooks: false,
    });
    const observed: string[] = [];
    registry.eventsRuntime.api.core.intercept("operation.beforeInvoke", () => {
      observed.push("before");
      return { action: "allow" };
    });
    registry.eventsRuntime.api.core.filter("operation.context", (payload) => {
      observed.push(`context:${String(payload.operation_id)}`);
      return payload;
    });
    registry.eventsRuntime.api.core.on("operation.afterInvoke", (payload) => {
      observed.push(`after:${String(payload.result)}`);
    });
    registry.eventsRuntime.api.core.on("operation.error", (payload) => {
      observed.push(`error:${String(payload.error)}`);
    });

    const record: PluginRecord = {
      id: "direct",
      source: "/modules/direct/src/plugin.ts",
      cliCommands: [],
      dependencies: [],
      enabled: true,
      featureFlags: [],
      gatewayMethods: [],
      httpRoutes: [],
      loaded: true,
      manifestPath: "/modules/direct/engenty.plugin.json",
      moduleOperations: [],
      provides: ["module.direct"],
      queues: [],
      requires: [],
      rootDir: "/modules/direct",
      services: [],
      sourceType: "module",
      testDataTypes: [],
    };
    registry.plugins.push(record);
    createApi(record, {}).server.registerOperation({
      operationId: "direct_echo",
      inputSchema: z.object({ value: z.string() }),
      outputSchema: z.string(),
      handler: async (input: unknown) => {
        const payload = input as { value: string };
        return payload.value;
      },
    });

    const token = await createToken(secret, { capabilities: [] });
    const app = createApiApp({
      registry,
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });

    const response = await app.request("/api/operations/direct_echo/invoke", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ input: { value: "ok" } }),
    });

    expect(response.status).toBe(200);
    expect(observed).toEqual(["before", "context:direct_echo", "after:ok"]);
  });

  it("lists operation registry and exposes MCP tools", async () => {
    const secret = "test-security-secret";
    const token = await createToken(secret, {
      capabilities: ["module.contacts.read", "module.invoices.read"],
    });
    const app = createApiApp({
      registry: makeRegistry(),
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });

    // The deprecated /api/modules/operations alias was removed 2026-08-04.
    const removedList = await app.request("/api/modules/operations", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(removedList.status).toBe(404);

    const listRes = await app.request("/api/operations/contracts", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      ok: true;
      data: Array<{ operationId: string }>;
    };
    expect(listBody.data.map((entry) => entry.operationId)).toContain(
      "contacts_list"
    );

    const contractsRes = await app.request("/api/operations/contracts", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(contractsRes.status).toBe(200);
    const contractsBody = (await contractsRes.json()) as {
      ok: true;
      data: Array<{
        operationId: string;
        auth: { requiredCapabilities: string[] };
      }>;
    };
    const contactsList = contractsBody.data.find(
      (entry) => entry.operationId === "contacts_list"
    );
    expect(contactsList?.auth.requiredCapabilities).toEqual([
      "module.contacts.read",
    ]);

    const contractById = await app.request(
      "/api/operations/contracts/contacts_list",
      {
        headers: { authorization: `Bearer ${token}` },
      }
    );
    expect(contractById.status).toBe(200);

    const toolContractsRes = await app.request("/api/tools/contracts", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(toolContractsRes.status).toBe(200);
    const toolContractsBody = (await toolContractsRes.json()) as {
      ok: true;
      data: Array<{ operationId: string }>;
    };
    expect(toolContractsBody.data.map((entry) => entry.operationId)).toContain(
      "contacts_list"
    );

    const toolContractById = await app.request(
      "/api/tools/contracts/contacts_list",
      {
        headers: { authorization: `Bearer ${token}` },
      }
    );
    expect(toolContractById.status).toBe(200);

    const toolsRes = await app.request("/api/mcp/tools", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(toolsRes.status).toBe(200);
    const toolsBody = (await toolsRes.json()) as {
      ok: true;
      data: Array<{ name: string }>;
    };
    expect(toolsBody.data.map((entry) => entry.name)).toContain(
      "contacts_delete"
    );

    // Removed 2026-08-04: it read `tenant_id` straight from the query with no
    // check against the caller's tenant, so any authenticated principal could
    // read another tenant's audit log — or, with the parameter omitted, every
    // tenant's. /events (below) defaults to the caller's tenant and 403s on a
    // mismatch, which is why only the successor survives.
    const auditLegacy = await app.request("/api/security/audit", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(auditLegacy.status).toBe(404);

    const auditEvents = await app.request("/api/security/audit/events", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(auditEvents.status).toBe(200);
  });

  it("invokes tool aliases and rejects module-scoped mismatches", async () => {
    const secret = "test-security-secret";
    const token = await createToken(secret, {
      capabilities: ["module.contacts.read", "module.invoices.read"],
    });
    const app = createApiApp({
      registry: makeRegistry(),
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });

    const globalInvoke = await app.request("/api/tools/contacts_get/invoke", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ input: { id: "c1" } }),
    });
    expect(globalInvoke.status).toBe(200);
    await expect(globalInvoke.json()).resolves.toMatchObject({
      data: { id: "c1", display_name: "Acme" },
    });

    const moduleContracts = await app.request("/api/contacts/tools", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(moduleContracts.status).toBe(200);
    const moduleContractsBody = (await moduleContracts.json()) as {
      ok: true;
      data: Array<{ moduleId: string; operationId: string }>;
    };
    expect(moduleContractsBody.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: "contacts",
          operationId: "contacts_get",
        }),
      ])
    );
    expect(
      moduleContractsBody.data.every((entry) => entry.moduleId === "contacts")
    ).toBe(true);

    const scopedInvoke = await app.request(
      "/api/contacts/tools/contacts_get/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { id: "c1" } }),
      }
    );
    expect(scopedInvoke.status).toBe(200);

    const mismatchedContract = await app.request(
      "/api/invoices/tools/contacts_get",
      {
        headers: { authorization: `Bearer ${token}` },
      }
    );
    expect(mismatchedContract.status).toBe(404);

    const mismatchedInvoke = await app.request(
      "/api/invoices/tools/contacts_get/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { id: "c1" } }),
      }
    );
    expect(mismatchedInvoke.status).toBe(404);
  });

  it("filters and rejects operations for tenant-disabled owning plugins", async () => {
    const secret = "test-security-secret";
    const token = await createToken(secret, {
      capabilities: ["module.contacts.read", "module.invoices.read"],
    });
    const app = createApiApp({
      registry: makeRegistry(),
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({ contacts: false }),
    });

    const contractsRes = await app.request("/api/operations/contracts", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(contractsRes.status).toBe(200);
    const contractsBody = (await contractsRes.json()) as {
      ok: true;
      data: Array<{ operationId: string }>;
    };
    expect(contractsBody.data.map((entry) => entry.operationId)).not.toContain(
      "contacts_list"
    );
    expect(contractsBody.data.map((entry) => entry.operationId)).toContain(
      "invoices_list"
    );

    const contractById = await app.request(
      "/api/operations/contracts/contacts_list",
      { headers: { authorization: `Bearer ${token}` } }
    );
    expect(contractById.status).toBe(403);
    const contractBody = (await contractById.json()) as {
      error: { code: string; details?: { reason?: string } };
    };
    expect(contractBody.error.code).toBe("plugin_tenant_disabled");
    expect(contractBody.error.details?.reason).toBe("plugin_tenant_disabled");

    const toolsRes = await app.request("/api/mcp/tools", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(toolsRes.status).toBe(200);
    const toolsBody = (await toolsRes.json()) as {
      ok: true;
      data: Array<{ name: string }>;
    };
    expect(toolsBody.data.map((entry) => entry.name)).not.toContain(
      "contacts_list"
    );

    const invoke = await app.request("/api/operations/contacts_list/invoke", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ input: {} }),
    });
    expect(invoke.status).toBe(403);
    const invokeBody = (await invoke.json()) as {
      error: { code: string; details?: { reason?: string } };
    };
    expect(invokeBody.error.code).toBe("plugin_tenant_disabled");

    const toolInvoke = await app.request("/api/tools/contacts_list/invoke", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ input: {} }),
    });
    expect(toolInvoke.status).toBe(403);

    const gateway = await app.request("/gateway/contacts_list", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(gateway.status).toBe(403);
  });

  it("rejects dependent operations when a required dependency is tenant-disabled", async () => {
    const secret = "test-security-secret";
    const token = await createToken(secret, {
      capabilities: ["module.contacts.read", "module.invoices.read"],
    });
    const registry = makeRegistry();
    const invoices = registry.plugins.find(
      (plugin) => plugin.id === "invoices"
    );
    if (!invoices) {
      throw new Error("invoices plugin missing from test registry");
    }
    invoices.requires = ["module.contacts"];
    invoices.dependencies = ["module.contacts"];

    const app = createApiApp({
      registry,
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({ contacts: false }),
    });

    const res = await app.request("/api/operations/invoices_list/invoke", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ input: {} }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: { code: string; details?: { reason?: string } };
    };
    expect(body.error.code).toBe("dependency_disabled");
    expect(body.error.details?.reason).toBe("dependency_disabled");
  });

  it("enforces capabilities and approval flow for risky operations", async () => {
    const secret = "test-security-secret";
    const readToken = await createToken(secret, {
      capabilities: ["module.contacts.read"],
    });
    const writeToken = await createToken(secret, {
      capabilities: ["module.contacts.write"],
    });
    const app = createApiApp({
      approvalService: createApprovalService(createFakeApprovalDb().client),
      registry: makeRegistry(),
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });

    const denied = await app.request("/api/operations/contacts_delete/invoke", {
      method: "POST",
      headers: {
        authorization: `Bearer ${readToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ input: { id: "c1" } }),
    });
    expect(denied.status).toBe(403);

    const approvalRequired = await app.request(
      "/api/operations/contacts_delete/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${writeToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { id: "c1" } }),
      }
    );
    expect(approvalRequired.status).toBe(202);
    const approvalBody = (await approvalRequired.json()) as {
      ok: false;
      error: {
        code: string;
        details?: { approvalRequestId?: string };
      };
    };
    expect(approvalBody.error.code).toBe("approval_required");
    expect(approvalBody.error.details?.approvalRequestId).toBeTruthy();

    const decide = await app.request(
      `/api/security/approvals/${approvalBody.error.details?.approvalRequestId}/decision`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${writeToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ decision: "allow_once" }),
      }
    );
    expect(decide.status).toBe(200);

    const allowed = await app.request(
      "/api/operations/contacts_delete/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${writeToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { id: "c1" } }),
      }
    );
    expect(allowed.status).toBe(200);

    const semanticInvoke = await app.request(
      "/api/operations/contacts_delete/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${writeToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { id: "c1" } }),
      }
    );
    expect(semanticInvoke.status).toBe(202);

    const mcpInvoke = await app.request("/api/mcp/tools/contacts_delete/call", {
      method: "POST",
      headers: {
        authorization: `Bearer ${writeToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ arguments: { id: "c1" } }),
    });
    expect(mcpInvoke.status).toBe(202);
  });

  it("forbids non-current-year invoice reads for invoices_current_year_reader", async () => {
    const secret = "test-security-secret";
    const currentYearToken = await createToken(secret, {
      capabilities: ["module.invoices.read"],
      roleProfiles: ["invoices_current_year_reader"],
      moduleIds: ["invoices"],
    });
    const app = createApiApp({
      registry: makeRegistry(),
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });

    const allowedCurrent = await app.request(
      "/api/operations/invoices_list/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${currentYearToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { year: new Date().getUTCFullYear() } }),
      }
    );
    expect(allowedCurrent.status).toBe(200);

    const deniedExplicit = await app.request(
      "/api/operations/invoices_list/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${currentYearToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          input: { year: new Date().getUTCFullYear() - 1 },
        }),
      }
    );
    expect(deniedExplicit.status).toBe(403);

    const deniedByResult = await app.request("/gateway/invoices_list", {
      method: "POST",
      headers: {
        authorization: `Bearer ${currentYearToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(deniedByResult.status).toBe(403);

    const deniedHttp = await app.request(
      `/api/invoices?year=${new Date().getUTCFullYear() - 1}`,
      {
        headers: { authorization: `Bearer ${currentYearToken}` },
      }
    );
    expect(deniedHttp.status).toBe(403);
  });

  it("allows invoice CRUD but forbids client writes for invoices_crud_connect_contacts", async () => {
    const secret = "test-security-secret";
    const token = await createToken(secret, {
      capabilities: [
        "module.invoices.read",
        "module.invoices.write",
        "module.contacts.read",
        "module.contacts.write",
      ],
      roleProfiles: ["invoices_crud_connect_contacts"],
      moduleIds: ["invoices", "contacts"],
    });
    const app = createApiApp({
      approvalService: createApprovalService(createFakeApprovalDb().client),
      registry: makeRegistry(),
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });

    const invoiceCreate = await app.request(
      "/api/operations/invoices_create/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { number: "INV-1" } }),
      }
    );
    expect(invoiceCreate.status).toBe(202);

    const contactsRead = await app.request(
      "/api/operations/contacts_get/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { id: "c1" } }),
      }
    );
    expect(contactsRead.status).toBe(200);

    const contactsWriteDenied = await app.request(
      "/api/operations/contacts_create/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { display_name: "Blocked" } }),
      }
    );
    expect(contactsWriteDenied.status).toBe(403);

    const contactsHttpWriteDenied = await app.request("/api/contacts", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ display_name: "Blocked" }),
    });
    expect(contactsHttpWriteDenied.status).toBe(403);
  });

  it("allows contacts and invoices reads but denies writes for contacts_with_invoices_viewer", async () => {
    const secret = "test-security-secret";
    const token = await createToken(secret, {
      capabilities: [
        "module.invoices.read",
        "module.invoices.write",
        "module.contacts.read",
        "module.contacts.write",
      ],
      roleProfiles: ["contacts_with_invoices_viewer"],
      moduleIds: ["invoices", "contacts"],
    });
    const app = createApiApp({
      registry: makeRegistry(),
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p) => p,
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });

    const contactsRead = await app.request(
      "/api/operations/contacts_list/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: {} }),
      }
    );
    expect(contactsRead.status).toBe(200);

    const invoicesRead = await app.request(
      "/api/operations/invoices_list/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { year: new Date().getUTCFullYear() } }),
      }
    );
    expect(invoicesRead.status).toBe(200);

    const contactsWriteDenied = await app.request(
      "/api/operations/contacts_delete/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { id: "c1" } }),
      }
    );
    expect(contactsWriteDenied.status).toBe(403);

    const invoicesWriteDenied = await app.request(
      "/api/operations/invoices_create/invoke",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { number: "INV-2" } }),
      }
    );
    expect(invoicesWriteDenied.status).toBe(403);
  });

  describe("audit API", () => {
    it("returns events with has_more and total", async () => {
      const secret = "test-security-secret";
      const token = await createToken(secret, {
        capabilities: ["module.contacts.read"],
      });
      const app = createApiApp({
        registry: makeRegistry(),
        config: { securityJwtSecret: secret },
        dataDir: "/tmp",
        resolvePath: (p) => p,
        auditLog: createNoopAuditLog(),
        tenantPluginOverrides: createTenantPluginOverrides({}),
      });

      const res = await app.request("/api/security/audit/events", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: true;
        data: {
          events: Record<string, unknown>[];
          has_more: boolean;
          total: number;
        };
      };
      expect(Array.isArray(body.data.events)).toBe(true);
      expect(typeof body.data.has_more).toBe("boolean");
      expect(typeof body.data.total).toBe("number");
    });

    it("accepts filter params", async () => {
      const secret = "test-security-secret";
      const token = await createToken(secret, {
        capabilities: ["module.contacts.read"],
      });
      const app = createApiApp({
        registry: makeRegistry(),
        config: { securityJwtSecret: secret },
        dataDir: "/tmp",
        resolvePath: (p) => p,
        auditLog: createNoopAuditLog(),
        tenantPluginOverrides: createTenantPluginOverrides({}),
      });

      const res = await app.request(
        "/api/security/audit/events?page=0&limit=10&types=auth.login_started",
        { headers: { authorization: `Bearer ${token}` } }
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: true;
        data: { events: unknown[] };
      };
      expect(Array.isArray(body.data.events)).toBe(true);
    });

    it("returns distincts", async () => {
      const secret = "test-security-secret";
      const token = await createToken(secret, {
        capabilities: ["module.contacts.read"],
      });
      const app = createApiApp({
        registry: makeRegistry(),
        config: { securityJwtSecret: secret },
        dataDir: "/tmp",
        resolvePath: (p) => p,
        auditLog: createNoopAuditLog(),
        tenantPluginOverrides: createTenantPluginOverrides({}),
      });

      const res = await app.request("/api/security/audit/distincts", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: true;
        data: {
          types: string[];
          module_ids: string[];
        };
      };
      expect(Array.isArray(body.data.types)).toBe(true);
      expect(Array.isArray(body.data.module_ids)).toBe(true);
    });

    it("returns 401 without auth", async () => {
      const app = createApiApp({
        registry: makeRegistry(),
        config: { securityJwtSecret: "secret" },
        dataDir: "/tmp",
        resolvePath: (p) => p,
        auditLog: createNoopAuditLog(),
        tenantPluginOverrides: createTenantPluginOverrides({}),
      });

      const eventsRes = await app.request("/api/security/audit/events");
      expect(eventsRes.status).toBe(401);

      const distinctsRes = await app.request("/api/security/audit/distincts");
      expect(distinctsRes.status).toBe(401);
    });
  });
});
