import { z } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import { createApiApp } from "./server.js";

describe("OpenAPI endpoints", () => {
  it("serves /api/openapi.json", async () => {
    const app = createApiApp({
      registry: {
        plugins: [],
        cliRegistrars: [],
        httpRoutes: [],
        gatewayMethods: [],
        moduleOperations: [],
        services: [],
        diagnostics: [],
      },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
    });

    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("openapi");
    expect(body).toHaveProperty("info");
    const openapi = body as { paths?: Record<string, unknown> };
    expect(openapi.paths).toHaveProperty("/api/users");
    expect(openapi.paths).toHaveProperty("/api/users/:id");
    expect(openapi.paths).toHaveProperty("/api/users/setup/context");
    expect(openapi.paths).toHaveProperty("/api/operations/contracts");
    expect(openapi.paths).toHaveProperty(
      "/api/operations/contracts/:operationId"
    );
    expect(openapi.paths).toHaveProperty("/api/operations/:operationId/invoke");
    expect(openapi.paths).toHaveProperty("/api/tools/contracts");
    expect(openapi.paths).toHaveProperty("/api/tools/contracts/:toolId");
    expect(openapi.paths).toHaveProperty("/api/tools/:toolId/invoke");
    expect(openapi.paths).toHaveProperty("/api/:moduleId/tools");
    expect(openapi.paths).toHaveProperty("/api/:moduleId/tools/:toolId");
    expect(openapi.paths).toHaveProperty("/api/:moduleId/tools/:toolId/invoke");
  });

  it("serves /api/docs HTML page", async () => {
    const app = createApiApp({
      registry: {
        plugins: [],
        cliRegistrars: [],
        httpRoutes: [],
        gatewayMethods: [],
        moduleOperations: [],
        services: [],
        diagnostics: [],
      },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
    });

    const res = await app.request("/api/docs");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Engenty API Docs");
    expect(html).toContain("/api/openapi.json");
    expect(html.toLowerCase()).toContain("scalar");
  });

  it("includes CRUD-style routes in generated OpenAPI paths", async () => {
    const app = createApiApp({
      registry: {
        plugins: [],
        cliRegistrars: [],
        services: [],
        diagnostics: [],
        gatewayMethods: [],
        moduleOperations: [],
        httpRoutes: [
          {
            pluginId: "invoices",
            source: "/modules/invoices/index.ts",
            pluginConfig: {},
            route: {
              method: "post",
              path: "/api/invoices",
              request: { body: z.object({ number: z.string() }) },
              responses: {
                201: {
                  description: "Created",
                  schema: z.object({ id: z.string(), number: z.string() }),
                },
              },
              handler: async () => new Response("{}", { status: 201 }),
            },
          },
          {
            pluginId: "invoices",
            source: "/modules/invoices/index.ts",
            pluginConfig: {},
            route: {
              method: "put",
              path: "/api/invoices/:id",
              request: {
                params: z.object({ id: z.string() }),
                body: z.object({ number: z.string().optional() }),
              },
              responses: {
                200: {
                  description: "Updated",
                  schema: z.object({ id: z.string(), number: z.string() }),
                },
              },
              handler: async () => ({}),
            },
          },
          {
            pluginId: "invoices",
            source: "/modules/invoices/index.ts",
            pluginConfig: {},
            route: {
              method: "delete",
              path: "/api/invoices/:id",
              request: {
                params: z.object({ id: z.string() }),
              },
              responses: {
                200: {
                  description: "Deleted",
                  schema: z.object({ ok: z.boolean() }),
                },
              },
              handler: async () => ({ ok: true }),
            },
          },
        ],
      },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
    });

    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { paths: Record<string, unknown> };
    expect(body.paths).toHaveProperty("/api/invoices");
    expect(body.paths).toHaveProperty("/api/invoices/:id");
  });

  it("generates typed invoke paths for registered tools", async () => {
    const app = createApiApp({
      registry: {
        plugins: [],
        cliRegistrars: [],
        services: [],
        diagnostics: [],
        gatewayMethods: [],
        httpRoutes: [],
        moduleOperations: [
          {
            pluginId: "contacts",
            operationId: "contacts_get",
            methodName: "contacts_get",
            source: "/modules/contacts/src/plugin.ts",
            pluginConfig: {},
            operation: {
              moduleId: "contacts",
              operationId: "contacts_get",
              requiredCapabilities: ["module.contacts.read"],
              riskLevel: "low",
              idempotent: true,
              dryRunSupported: false,
              requiresApproval: false,
            },
            inputSchema: z.object({ id: z.string() }),
            outputSchema: z.object({
              id: z.string(),
              display_name: z.string(),
            }),
            handler: async () => ({ id: "c1", display_name: "Acme" }),
          },
        ],
      },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
    });

    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      paths: Record<
        string,
        {
          post?: {
            requestBody?: {
              content?: Record<string, { schema?: unknown }>;
            };
            responses?: Record<
              string,
              { content?: Record<string, { schema?: unknown }> }
            >;
          };
        }
      >;
    };
    expect(body.paths).toHaveProperty("/api/tools/contacts_get/invoke");
    expect(body.paths).toHaveProperty(
      "/api/contacts/tools/contacts_get/invoke"
    );
    const invokePath = body.paths["/api/tools/contacts_get/invoke"];
    expect(
      JSON.stringify(
        invokePath?.post?.requestBody?.content?.["application/json"]?.schema
      )
    ).toContain("id");
    expect(
      JSON.stringify(
        invokePath?.post?.responses?.["200"]?.content?.["application/json"]
          ?.schema
      )
    ).toContain("display_name");
  });
});
