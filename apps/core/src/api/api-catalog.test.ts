import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PluginRegistry } from "../plugins/registry.js";
import { buildApiCatalog } from "./api-catalog.js";
import { clearCatalogSearchEmbeddingCache } from "./api-catalog-search.js";

const { embedManyMock, embedMock } = vi.hoisted(() => ({
  embedManyMock: vi.fn(),
  embedMock: vi.fn(),
}));

vi.mock("ai", () => ({
  embed: embedMock,
  embedMany: embedManyMock,
}));

function makeRegistry(): PluginRegistry {
  return {
    plugins: [
      {
        id: "contacts",
        name: "Contacts",
        dependencies: [],
        enabled: true,
        featureFlags: [],
        gatewayMethods: ["contacts_list"],
        httpRoutes: [],
        loaded: true,
        manifestPath: "contacts/engenty.plugin.json",
        moduleOperations: ["contacts_list"],
        provides: ["module.contacts", "module.contacts.read"],
        queues: [],
        rootDir: "/modules/contacts",
        services: [],
        source: "/modules/contacts/src/plugin.ts",
        sourceType: "module",
        testDataTypes: [],
      },
      {
        id: "team",
        name: "Team members",
        dependencies: [],
        enabled: true,
        featureFlags: [],
        gatewayMethods: [],
        httpRoutes: ["GET /api/team"],
        loaded: true,
        manifestPath: "team/engenty.plugin.json",
        moduleOperations: [],
        provides: ["module.team", "module.team.read"],
        queues: [],
        rootDir: "/modules/team",
        services: [],
        source: "/modules/team/src/plugin.ts",
        sourceType: "module",
        testDataTypes: [],
      },
    ],
    cliRegistrars: [],
    diagnostics: [],
    featureFlags: [],
    gatewayMethods: [
      {
        pluginId: "contacts",
        source: "test",
        pluginConfig: {},
        method: {
          name: "contacts_list",
          summary: "List contacts",
          description: "Find contacts by search term",
          inputSchema: z.object({
            search: z.string().optional(),
          }),
          outputSchema: z.object({
            items: z.array(z.object({ id: z.string() })),
          }),
          operation: {
            moduleId: "contacts",
            operationId: "contacts_list",
            requiredCapabilities: ["module.contacts.read"],
            riskLevel: "low",
            requiresApproval: false,
          },
          handler: async () => ({ items: [] }),
        },
      },
    ],
    httpRoutes: [
      {
        pluginId: "team",
        source: "test",
        pluginConfig: {},
        route: {
          method: "get",
          path: "/api/team",
          summary: "List team members",
          operation: {
            moduleId: "team",
            requiredCapabilities: ["module.team.read"],
            riskLevel: "low",
            requiresApproval: false,
          },
          handler: async () => [],
        },
      },
    ],
    moduleOperations: [
      {
        pluginId: "contacts",
        operationId: "contacts_list",
        methodName: "contacts_list",
        source: "test",
        pluginConfig: {},
        operation: {
          moduleId: "contacts",
          operationId: "contacts_list",
          riskLevel: "low",
          idempotent: true,
          dryRunSupported: false,
          requiresApproval: false,
          requiredCapabilities: ["module.contacts.read"],
        },
        inputSchema: z.object({ q: z.string().optional() }),
        outputSchema: z.object({
          items: z.array(z.object({ id: z.string() })),
        }),
        handler: async () => ({ items: [] }),
      },
    ],
    profilePolicies: [],
    resultPolicies: [],
    services: [],
    testDataTypes: [],
    queueDefinitions: [],
    queueHandlers: new Map(),
  };
}

describe("buildApiCatalog", () => {
  beforeEach(() => {
    clearCatalogSearchEmbeddingCache();
    embedManyMock.mockReset();
    embedMock.mockReset();
  });

  const openApiDocument = {
    components: {
      schemas: {
        SelfUser: {
          type: "object",
          required: ["id", "display_name"],
          properties: {
            id: { type: "string" },
            display_name: { type: "string" },
            email: { type: "string" },
          },
        },
      },
    },
    paths: {
      "/api/users/u-self": {
        get: {
          summary: "Current user",
          tags: ["users"],
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SelfUser" },
                },
              },
            },
          },
        },
      },
      "/api/team": {
        get: {
          summary: "List team members",
          tags: ["team"],
          parameters: [{ in: "query", name: "pageSize" }],
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["id", "full_name"],
                      properties: {
                        id: { type: "string" },
                        full_name: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  it("returns read-only HTTP routes with compact request and response summaries", async () => {
    const result = await buildApiCatalog({
      input: {
        query: "team members",
        readOnlyOnly: true,
        limit: 10,
        strategy: "lexical",
      },
      openApiDocument,
      registry: makeRegistry(),
    });

    expect(result.total).toBe(1);
    expect(result.matches[0]).toMatchObject({
      id: "GET /api/team",
      kind: "http_route",
      method: "get",
      path: "/api/team",
      readOnly: true,
      request: {
        params: [],
        query: ["pageSize"],
      },
      response: {
        successStatuses: [200],
      },
      auth: {
        requiredCapabilities: ["module.team.read"],
      },
    });
    expect(result.matches[0]?.response?.schema).toContain("Array<");
  });

  it("returns tools with schema hints and auth metadata", async () => {
    const result = await buildApiCatalog({
      input: {
        kind: "tool",
        query: "contacts",
        limit: 10,
        strategy: "lexical",
      },
      openApiDocument,
      registry: makeRegistry(),
    });

    expect(result.total).toBe(1);
    expect(result.matches[0]).toMatchObject({
      id: "contacts_list",
      kind: "tool",
      moduleId: "contacts",
      pluginId: "contacts",
      inputSchema: "zod_schema",
      outputSchema: "zod_schema",
      readOnly: true,
      toolId: "contacts_list",
      transports: ["rest", "cli", "mcp"],
      auth: {
        requiredCapabilities: ["module.contacts.read"],
        requiresApproval: false,
        riskLevel: "low",
      },
    });
  });

  it("does not exclude tools when an HTTP method hint is present", async () => {
    const result = await buildApiCatalog({
      input: {
        kind: "tool",
        limit: 10,
        method: "get",
        query: "contacts",
        strategy: "lexical",
      },
      openApiDocument,
      registry: makeRegistry(),
    });

    expect(result.total).toBe(1);
    expect(result.matches[0]).toMatchObject({
      id: "contacts_list",
      kind: "tool",
      toolId: "contacts_list",
    });
  });

  it("ranks callable search tools by catalog metadata", async () => {
    const registry = makeRegistry();
    registry.moduleOperations.push({
      pluginId: "contacts",
      operationId: "contacts_contact_search",
      methodName: "contacts_contact_search",
      source: "test",
      pluginConfig: {},
      operation: {
        moduleId: "contacts",
        operationId: "contacts_contact_search",
        riskLevel: "low",
        idempotent: true,
        dryRunSupported: false,
        requiresApproval: false,
        requiredCapabilities: ["module.contacts.read"],
      },
      inputSchema: z.object({
        role: z.string().optional(),
        // Lexical (BM25) is preserved as an explicit option callers can pin
        // for quick lookups even though the provider also supports hybrid.
        strategy: z.enum(["hybrid", "lexical", "semantic"]).optional(),
        query: z.string().optional(),
      }),
      outputSchema: z.object({
        results: z.array(z.object({ score: z.number() })),
      }),
      summary: "Search contacts with match evidence",
      handler: async () => ({ results: [] }),
    });

    const result = await buildApiCatalog({
      input: {
        kind: "tool",
        limit: 10,
        query: "contacts search",
        strategy: "lexical",
      },
      openApiDocument,
      registry,
    });

    expect(result.matches[0]).toMatchObject({
      id: "contacts_contact_search",
      kind: "tool",
      toolId: "contacts_contact_search",
    });
  });

  it("uses semantic ranking when lexical query text is not present", async () => {
    const registry = makeRegistry();
    registry.moduleOperations.push({
      pluginId: "contacts",
      operationId: "contacts_find_counsel",
      methodName: "contacts_find_counsel",
      source: "test",
      pluginConfig: {},
      operation: {
        moduleId: "contacts",
        operationId: "contacts_find_counsel",
        riskLevel: "low",
        idempotent: true,
        dryRunSupported: false,
        requiresApproval: false,
        requiredCapabilities: ["module.contacts.read"],
      },
      description:
        "Discover retained outside counsel and legal representatives.",
      handler: async () => ({ items: [] }),
      summary: "Find counsel contacts",
    });
    embedMock.mockResolvedValueOnce({ embedding: [1, 0] });
    embedManyMock.mockResolvedValueOnce({
      embeddings: [
        [0, 1],
        [1, 0],
      ],
    });

    const result = await buildApiCatalog({
      input: {
        kind: "tool",
        limit: 10,
        query: "advocate",
        strategy: "semantic",
      },
      openApiDocument,
      registry,
    });

    expect(result.matches[0]).toMatchObject({
      id: "contacts_find_counsel",
      kind: "tool",
      toolId: "contacts_find_counsel",
    });
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(embedManyMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to lexical ranking when embeddings are unavailable", async () => {
    embedMock.mockRejectedValueOnce(new Error("401 Unauthorized"));
    embedManyMock.mockRejectedValueOnce(new Error("401 Unauthorized"));

    const result = await buildApiCatalog({
      input: {
        kind: "all",
        limit: 10,
        query: "contacts",
        strategy: "hybrid",
      },
      openApiDocument,
      registry: makeRegistry(),
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]).toMatchObject({
      toolId: "contacts_list",
    });
  });

  it("applies catalog filters before semantic ranking", async () => {
    embedMock.mockResolvedValueOnce({ embedding: [1, 0] });
    embedManyMock.mockResolvedValueOnce({
      embeddings: [[1, 0]],
    });

    const result = await buildApiCatalog({
      input: {
        kind: "http_route",
        limit: 10,
        method: "get",
        moduleId: "team",
        pluginId: "team",
        query: "people directory",
        readOnlyOnly: true,
        strategy: "semantic",
      },
      openApiDocument,
      registry: makeRegistry(),
    });

    expect(result.matches).toEqual([
      expect.objectContaining({
        id: "GET /api/team",
        kind: "http_route",
        moduleId: "team",
        pluginId: "team",
      }),
    ]);
    expect(embedManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [expect.stringContaining("moduleId: team")],
      })
    );
  });

  it("reuses cached catalog entry embeddings for unchanged entries", async () => {
    embedMock
      .mockResolvedValueOnce({ embedding: [1, 0] })
      .mockResolvedValueOnce({ embedding: [0, 1] });
    embedManyMock.mockResolvedValueOnce({
      embeddings: [[1, 0]],
    });

    await buildApiCatalog({
      input: {
        kind: "tool",
        limit: 10,
        query: "contacts",
        strategy: "semantic",
      },
      openApiDocument,
      registry: makeRegistry(),
    });
    await buildApiCatalog({
      input: {
        kind: "tool",
        limit: 10,
        query: "people",
        strategy: "semantic",
      },
      openApiDocument,
      registry: makeRegistry(),
    });

    expect(embedMock).toHaveBeenCalledTimes(2);
    expect(embedManyMock).toHaveBeenCalledTimes(1);
  });

  it("does not request embeddings for lexical search", async () => {
    const result = await buildApiCatalog({
      input: {
        kind: "tool",
        limit: 10,
        query: "contacts",
        strategy: "lexical",
      },
      openApiDocument,
      registry: makeRegistry(),
    });

    expect(result.total).toBe(1);
    expect(embedMock).not.toHaveBeenCalled();
    expect(embedManyMock).not.toHaveBeenCalled();
  });

  it("prefers tools over HTTP routes when searching all entries", async () => {
    const result = await buildApiCatalog({
      input: {
        kind: "all",
        query: "list",
        limit: 10,
        strategy: "lexical",
      },
      openApiDocument,
      registry: makeRegistry(),
    });

    expect(result.matches.map((entry) => entry.kind)).toEqual([
      "tool",
      "http_route",
    ]);
    expect(result.matches[0]).toMatchObject({
      id: "contacts_list",
      kind: "tool",
      toolId: "contacts_list",
    });
  });

  it("filters tenant-disabled module-owned routes and operations", async () => {
    const result = await buildApiCatalog({
      input: {
        limit: 10,
      },
      openApiDocument,
      registry: makeRegistry(),
      tenantId: "tenant-1",
      tenantPluginOverrides: {
        contacts: false,
        team: false,
      },
    });

    expect(result.matches).toEqual([
      expect.objectContaining({
        id: "GET /api/users/u-self",
        kind: "http_route",
      }),
    ]);
    expect(result.total).toBe(1);
  });

  it("filters module catalog entries when a required dependency is tenant-disabled", async () => {
    const registry = makeRegistry();
    registry.plugins.push({
      id: "leads",
      name: "Leads",
      dependencies: [],
      enabled: true,
      featureFlags: [],
      gatewayMethods: [],
      httpRoutes: [],
      loaded: true,
      manifestPath: "leads/engenty.plugin.json",
      moduleOperations: ["leads_list"],
      provides: ["module.leads"],
      queues: [],
      requires: ["team"],
      rootDir: "/modules/leads",
      services: [],
      source: "/modules/leads/src/plugin.ts",
      sourceType: "module",
      testDataTypes: [],
    });
    registry.moduleOperations.push({
      pluginId: "leads",
      operationId: "leads_list",
      methodName: "leads_list",
      source: "test",
      pluginConfig: {},
      operation: {
        moduleId: "leads",
        operationId: "leads_list",
        riskLevel: "low",
        idempotent: true,
        dryRunSupported: false,
        requiresApproval: false,
        requiredCapabilities: [],
      },
      handler: async () => ({ items: [] }),
    });

    const result = await buildApiCatalog({
      input: {
        kind: "tool",
        limit: 10,
      },
      openApiDocument,
      registry,
      tenantId: "tenant-1",
      tenantPluginOverrides: {
        team: false,
      },
    });

    expect(result.matches.map((entry) => entry.id)).toEqual(["contacts_list"]);
    expect(result.total).toBe(1);
  });
});
