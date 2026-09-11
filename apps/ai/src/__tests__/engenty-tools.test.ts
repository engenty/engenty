import { describe, expect, it } from "vitest";
import {
  describeEngentyTool,
  discoverEngentyTools,
  type EngentyToolsClient,
  type EngentyToolsClientResult,
  executeEngentyTool,
  getEngentyToolsContext,
  listEngentyToolModules,
  normalizeToolContract,
  searchEngentyTools,
} from "../../ai/tools/engenty-tools/index.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import type { SpaceGateSurface } from "../../ai/tools/engenty-tools/lib/space-gate.js";
import { buildUnresolvedToolCallResult } from "../ai/conversation/unresolved-tool-call.js";
import {
  EngentyCoreHttpError,
  type EngentyToolContract,
} from "../ai/core-http-client.js";
import { createApiCatalogSearchStore } from "../dal/api-catalog/api-catalog-search-store.js";

const CATALOG_ENVELOPE = {
  ok: true,
  catalog_only: true,
  message: "These are operation contracts, not app records.",
  next: "Execute one returned operation before stating record facts.",
};

const EMPTY_EXECUTE_META = {
  source: "engenty_tool_execute",
  empty: true,
  message:
    "The operation succeeded and returned no records. Report an empty result; do not invent rows.",
};

const marketingSpace: SpaceGateSurface = {
  allConnectorPrefixes: new Set(),
  connectorPrefixes: new Set(),
  moduleIds: new Set(["projects", "contacts"]),
  readOnlyModuleIds: new Set(["contacts"]),
  spaceId: "019fe8ec-0000-0000-0000-000000000001",
};

const contactsListContract = {
  auth: {
    requiredCapabilities: ["module.contacts.read"],
    requiredPermissions: ["cap:module.contacts.read"],
    requiredScopes: [],
    requiresApproval: false,
    riskLevel: "low" as const,
  },
  description: "Fetch contacts with filters.",
  inputSchema: {
    hint: "zod_schema",
    jsonSchema: {
      type: "object",
      properties: { query: { type: "string" } },
    },
    type: "zod",
  },
  moduleId: "contacts",
  operationId: "contacts_list",
  outputSchema: {
    hint: "zod_schema",
    jsonSchema: {
      type: "object",
      properties: { items: { type: "array", items: { type: "object" } } },
    },
    type: "zod",
  },
  pluginId: "contacts",
  summary: "List contacts",
  toolId: "contacts_list",
};

const contactsDeleteContract = {
  ...contactsListContract,
  auth: {
    ...contactsListContract.auth,
    requiredCapabilities: ["module.contacts.write"],
    requiredPermissions: ["cap:module.contacts.write"],
    requiresApproval: true,
    riskLevel: "critical" as const,
  },
  description: "Delete a contact.",
  operationId: "contacts_delete",
  summary: "Delete contact",
  toolId: "contacts_delete",
};

const kbSearchContract = {
  ...contactsListContract,
  description: "Search Knowledge Base article content.",
  moduleId: "knowledge-base",
  operationId: "kb_search",
  pluginId: "knowledge-base",
  summary: "Search Knowledge Base content",
  toolId: "kb_search",
};

const kbArticlesListContract = {
  ...contactsListContract,
  description: "List Knowledge Base articles.",
  moduleId: "knowledge-base",
  operationId: "kb_articles_list",
  pluginId: "knowledge-base",
  summary: "List Knowledge Base articles",
  toolId: "kb_articles_list",
};

const projectsListContract = {
  ...contactsListContract,
  description: "List projects",
  moduleId: "projects",
  operationId: "projects_list",
  pluginId: "projects",
  readOnly: true as const,
  summary: "List projects",
  toolId: "projects_list",
};

const defaultWorkspaceContext = {
  canSwitchTenant: true,
  currentTenant: {
    id: "tenant-1",
    name: "Acme",
    slug: "acme",
  },
  isSuperAdmin: false,
  isTenantAdmin: true,
  onboarded: true,
  tenantRole: "admin" as const,
  tenantSupportedLocales: ["en", "de"],
  userId: "user-1",
};

function createTestClient(
  overrides: Partial<EngentyToolsClient> = {}
): EngentyToolsClientResult {
  return {
    ok: true,
    client: {
      decideApproval: async () => ({}),
      describeTool: async () => contactsListContract,
      getWorkspaceContext: async () => defaultWorkspaceContext,
      invokeTool: async <_TInput, TResult>() => ({}) as TResult,
      listAiAgents: async () => ({ agents: [] }),
      listModuleCapabilitySeeds: async () => ({ capabilities: [] }),
      listPlugins: async () => [],
      listToolContracts: async () => [],
      ...overrides,
    },
  };
}

// Build an in-process `core_api_catalog` store from a fixed list of
// contracts so search tests do not need a live core HTTP endpoint.
function makeCatalog(contracts: EngentyToolContract[]) {
  return createApiCatalogSearchStore({
    loadContracts: async () => contracts,
  });
}

describe("Engenty Mastra tools helpers", () => {
  it("normalizes core contracts with risk and capability metadata", () => {
    expect(normalizeToolContract(contactsDeleteContract)).toMatchObject({
      auth: {
        requiredCapabilities: ["module.contacts.write"],
        requiresApproval: true,
        riskLevel: "critical",
      },
      execution: {
        approvalBehavior: "requires_approval",
        readOnly: false,
      },
      id: "contacts_delete",
      input: {
        jsonSchema: {
          type: "object",
          properties: { query: { type: "string" } },
        },
      },
      kind: "tool",
      moduleId: "contacts",
      tool: {
        invokePath: "/api/tools/contacts_delete/invoke",
        toolId: "contacts_delete",
      },
    });
  });

  it("searches and groups compact tool results", async () => {
    const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;
    Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
    try {
      const result = await searchEngentyTools(
        { moduleId: "contacts", query: "list" },
        {
          apiCatalog: makeCatalog([
            contactsDeleteContract,
            contactsListContract,
          ]),
        }
      );

      expect(result).toMatchObject({
        ...CATALOG_ENVELOPE,
        matches: [
          {
            name: "contacts_list",
            description: "Fetch contacts with filters.",
          },
        ],
      });
      expect(result).toHaveProperty("space_scope");
      expect(JSON.stringify(result)).not.toContain("proj-001");
      expect(JSON.stringify(result)).not.toContain("Sales-Einführung");
      // searchEngentyTools returns a union whose error members carry no
      // `matches`; narrow rather than cast so a regression to the error
      // envelope fails here instead of silently reading undefined.
      if (!("matches" in result)) {
        throw new Error(`expected a match envelope, got ${result.code}`);
      }
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).not.toHaveProperty("status");
      expect(result.matches[0]).not.toHaveProperty("rows");
    } finally {
      if (originalGatewayKey === undefined) {
        Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
      } else {
        process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
      }
    }
  });

  it("discovers likely tools from a natural-language request", async () => {
    const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;
    Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
    try {
      const result = await discoverEngentyTools(
        {
          moduleId: "knowledge-base",
          request: "search for Förderungen in KB",
        },
        createTestClient({
          describeTool: async () => kbSearchContract,
          listToolContracts: async () => [
            contactsListContract,
            kbArticlesListContract,
            kbSearchContract,
          ],
        })
      );

      expect(result).toMatchObject({
        ...CATALOG_ENVELOPE,
        matches: expect.arrayContaining([
          expect.objectContaining({
            name: "kb_search",
          }),
        ]),
      });
    } finally {
      if (originalGatewayKey === undefined) {
        Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
      } else {
        process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
      }
    }
  });

  it("falls back to module tools when a catalog query looks like app content", async () => {
    // BM25 matches on token overlap ("article" would hit kb_articles_list),
    // so the fallback only fires when no query token appears in any contract.
    const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;
    Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
    try {
      const result = await searchEngentyTools(
        {
          moduleId: "knowledge-base",
          query: "quarterly pricing figures",
        },
        {
          apiCatalog: makeCatalog([
            contactsListContract,
            kbArticlesListContract,
            kbSearchContract,
          ]),
        }
      );

      expect(result).toMatchObject({
        ...CATALOG_ENVELOPE,
        matches: expect.arrayContaining([
          expect.objectContaining({ name: "kb_search" }),
          expect.objectContaining({ name: "kb_articles_list" }),
        ]),
        note: "No tool contract matched that query text. Returning available module tools instead; this was only catalog discovery, not an app data search.",
      });
    } finally {
      if (originalGatewayKey === undefined) {
        Reflect.deleteProperty(process.env, "AI_GATEWAY_API_KEY");
      } else {
        process.env.AI_GATEWAY_API_KEY = originalGatewayKey;
      }
    }
  });

  it("lists valid module ids from available tool contracts", async () => {
    const result = await listEngentyToolModules(
      createTestClient({
        listPlugins: async () => [
          {
            description: "Manage contacts.",
            enabled: true,
            id: "contacts",
            kind: "module",
            loaded: true,
            name: "Contacts",
            provides: ["module.contacts", "ui.route.module.contacts"],
          },
          {
            description: "Manage knowledge.",
            enabled: true,
            id: "knowledge-base",
            kind: "module",
            loaded: true,
            name: "Knowledge Base",
            provides: [
              "module.knowledge-base",
              "ui.route.module.knowledge-base",
            ],
          },
          {
            description: "Disabled module.",
            enabled: false,
            id: "disabled",
            kind: "module",
            loaded: true,
            name: "Disabled",
            provides: ["module.disabled"],
          },
        ],
        listToolContracts: async () => [
          contactsDeleteContract,
          contactsListContract,
          kbArticlesListContract,
          kbSearchContract,
        ],
      })
    );

    expect(result).toMatchObject({
      ...CATALOG_ENVELOPE,
      modules: [
        {
          routePrefix: "/mdl/contacts",
          description: "Manage contacts.",
          moduleId: "contacts",
          name: "Contacts",
          readOnlyToolCount: 1,
          sampleToolIds: ["contacts_delete", "contacts_list"],
          slug: "contacts",
          toolCount: 2,
        },
        {
          routePrefix: "/mdl/knowledge-base",
          description: "Manage knowledge.",
          moduleId: "knowledge-base",
          name: "Knowledge Base",
          readOnlyToolCount: 2,
          sampleToolIds: ["kb_articles_list", "kb_search"],
          slug: "knowledge-base",
          toolCount: 2,
        },
      ],
    });
  });

  it("returns safe user and workspace context separately from modules", async () => {
    const result = await getEngentyToolsContext(createTestClient());

    expect(result).toEqual({
      ok: true,
      context: {
        canSwitchTenant: true,
        currentTenant: {
          id: "tenant-1",
          name: "Acme",
          slug: "acme",
        },
        isSuperAdmin: false,
        isTenantAdmin: true,
        onboarded: true,
        tenantRole: "admin",
        tenantSupportedLocales: ["en", "de"],
        userId: "user-1",
      },
      message:
        "Workspace context loaded for the current authenticated request.",
    });
  });

  it("describes a selected tool", async () => {
    const result = await describeEngentyTool(
      { id: "contacts_delete" },
      createTestClient({
        describeTool: async () => contactsDeleteContract,
      })
    );

    expect(result).toMatchObject({
      ok: true,
      entry: {
        id: "contacts_delete",
        auth: {
          requiresApproval: true,
          riskLevel: "critical",
        },
        input: {
          jsonSchema: {
            type: "object",
            properties: { query: { type: "string" } },
          },
        },
      },
    });
  });

  it("returns only the invoke payload on successful execution", async () => {
    const result = await executeEngentyTool(
      { id: "kb_search", input: { query: "Förderungen", limit: 10 } },
      createTestClient({
        describeTool: async () => kbSearchContract,
        invokeTool: async <_TInput, TResult>() =>
          ({ error: "No knowledge base found" }) as TResult,
      })
    );

    expect(result).toEqual({
      ok: true,
      operation_id: "kb_search",
      data: { error: "No knowledge base found" },
    });
    expect(result).not.toHaveProperty("tool");
  });

  it("pre-gates a requiresApproval op with a deny result when no approval channel exists", async () => {
    // contactsDeleteContract has `requiresApproval: true`. With no run context (and
    // thus no approvalPolicy), the execute-boundary gate fails safe: it DENIES
    // instead of invoking. The interactive suspend and voice artifact policies are
    // covered in engenty-tool-execute-tool.test.ts. invokeTool throws so the test
    // fails loudly if the gate ever lets the call through.
    const result = (await executeEngentyTool(
      { id: "contacts_delete", input: { id: "c1" } },
      createTestClient({
        describeTool: async () => contactsDeleteContract,
        invokeTool: async () => {
          throw new Error("invoke should not run for a gated op");
        },
      })
    )) as { error?: string; ok?: boolean };

    expect(result.ok).toBe(false);
    expect(result.error).toBe("approval_required");
  });

  it("surfaces core's 202 approval_required as a deny result when the contract did not flag it", async () => {
    // kbSearchContract is not flagged requiresApproval, so the pre-gate passes —
    // but if core itself returns 202 at invoke time, the backstop routes it through
    // the same approval policy (default deny with no run context).
    const result = (await executeEngentyTool(
      { id: "kb_search", input: { query: "x" } },
      createTestClient({
        describeTool: async () => kbSearchContract,
        invokeTool: async () => {
          throw new EngentyCoreHttpError(
            "Approval required",
            202,
            "approval_required",
            { approvalRequestId: "apr_1" }
          );
        },
      })
    )) as { error?: string; ok?: boolean };

    expect(result.ok).toBe(false);
    expect(result.error).toBe("approval_required");
  });

  it("returns unavailable when the run has no bearer token", async () => {
    await expect(
      searchEngentyTools({ query: "contacts" }, undefined)
    ).resolves.toEqual({
      ok: false,
      code: "unauthorized",
      message:
        "Core-backed Engenty tools are unavailable because this run does not include an end-user bearer token.",
    });
  });

  it("names Space-mounted modules, not the current user/tenant, when Space-bound", async () => {
    const result = await engentyToolsRunAls.run({ space: marketingSpace }, () =>
      listEngentyToolModules(
        createTestClient({
          listPlugins: async () => [
            {
              description: "Projects.",
              enabled: true,
              id: "projects",
              kind: "module",
              loaded: true,
              name: "Projects",
              provides: ["module.projects"],
            },
            {
              description: "Offers.",
              enabled: true,
              id: "offers",
              kind: "module",
              loaded: true,
              name: "Offers",
              provides: ["module.offers"],
            },
          ],
          listToolContracts: async () => [projectsListContract],
        })
      )
    );

    expect(result).toMatchObject({
      ...CATALOG_ENVELOPE,
      note: expect.stringContaining("mounted in this Space"),
      modules: [expect.objectContaining({ moduleId: "projects" })],
    });
    expect(JSON.stringify(result)).not.toContain("current user/tenant");
    if (!("modules" in result)) {
      throw new Error("expected modules envelope");
    }
    expect(result.modules).toHaveLength(1);
  });
});

/**
 * Exact sequence from logs/projects-chat.md: catalog named `projects_list`,
 * execute returned nothing the model could read, and the assistant invented
 * proj-001 / Sales-Einführung. Each step below must make that invention
 * impossible from the tool result alone.
 */
describe("projects-chat regression: catalog is not data", () => {
  const fabricated = [
    "proj-001",
    "Sales-Einführung",
    "Marketing-Kampagne 2026",
  ];

  it("a catalog hit on projects_list is a contract, not project rows", async () => {
    const result = await engentyToolsRunAls.run({ space: marketingSpace }, () =>
      searchEngentyTools(
        {
          kind: "tool",
          moduleId: "projects",
          query: "list",
          readOnlyOnly: true,
        },
        {
          apiCatalog: makeCatalog([projectsListContract, contactsListContract]),
        }
      )
    );

    expect(result).toMatchObject({
      ...CATALOG_ENVELOPE,
      matches: [expect.objectContaining({ name: "projects_list" })],
    });
    expect(result).toHaveProperty("space_scope");
    if (!("matches" in result)) {
      throw new Error("expected catalog matches");
    }
    expect(result.matches[0]).not.toHaveProperty("id");
    expect(result.matches[0]).not.toHaveProperty("status");
    const serialized = JSON.stringify(result);
    for (const value of fabricated) {
      expect(serialized).not.toContain(value);
    }
  });

  it("a missing execute result is a structured failure, not empty data", async () => {
    const result = await executeEngentyTool(
      { id: "projects_list", input: {} },
      createTestClient({
        describeTool: async () => projectsListContract,
        invokeTool: async () => undefined as never,
      })
    );

    expect(result).toMatchObject({
      ok: false,
      error: "no_tool_result",
      operation_id: "projects_list",
    });
    expect(JSON.stringify(result)).toContain(
      "Do not guess; report retrieval failure or retry once."
    );
    for (const value of fabricated) {
      expect(JSON.stringify(result)).not.toContain(value);
    }
  });

  it("a dangling engenty_tool_execute call tells the model not to guess", () => {
    const result = buildUnresolvedToolCallResult({
      knownToolNames: ["engenty_tools_search", "engenty_tool_execute"],
      toolName: "engenty_tool_execute",
    });
    expect(result).toMatchObject({
      code: "no_tool_result",
      ok: false,
      tool_name: "engenty_tool_execute",
    });
    expect(result.error).toContain(
      "Do not guess; report retrieval failure or retry once."
    );
  });

  it("a real empty projects list is success, not an error", async () => {
    const result = await executeEngentyTool(
      { id: "projects_list", input: {} },
      createTestClient({
        describeTool: async () => projectsListContract,
        invokeTool: async <_TInput, TResult>() =>
          ({ data: [], total: 0 }) as TResult,
      })
    );

    expect(result).toEqual({
      ok: true,
      operation_id: "projects_list",
      data: { data: [], total: 0 },
      meta: EMPTY_EXECUTE_META,
    });
  });

  it("unmounted and read-only refusals are final and non-retryable", async () => {
    const unmounted = await engentyToolsRunAls.run(
      { space: marketingSpace },
      () =>
        executeEngentyTool(
          { id: "offers_list", input: {} },
          createTestClient({
            describeTool: async () => ({
              ...contactsListContract,
              moduleId: "offers",
              operationId: "offers_list",
              pluginId: "offers",
              summary: "List offers",
              toolId: "offers_list",
            }),
            invokeTool: async () => {
              throw new Error("unmounted ops must not invoke");
            },
          })
        )
    );
    expect(unmounted).toMatchObject({
      ok: false,
      error: "module_not_in_space",
    });
    expect(JSON.stringify(unmounted).toLowerCase()).toContain("do not retry");

    const readOnlyWrite = await engentyToolsRunAls.run(
      { space: marketingSpace },
      () =>
        executeEngentyTool(
          { id: "contacts_delete", input: { id: "c1" } },
          createTestClient({
            describeTool: async () => contactsDeleteContract,
            invokeTool: async () => {
              throw new Error("read-only writes must not invoke");
            },
          })
        )
    );
    expect(readOnlyWrite).toMatchObject({
      ok: false,
      error: "space_read_only",
    });
    expect(JSON.stringify(readOnlyWrite).toLowerCase()).toContain(
      "do not retry"
    );
  });
});
