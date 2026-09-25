import { describe, expect, it } from "vitest";
import {
  type EngentyToolsClient,
  type EngentyToolsClientResult,
  executeEngentyTool,
  listEngentyToolModules,
  searchEngentyTools,
} from "../../ai/tools/engenty-tools/index.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import type { SpaceGateSurface } from "../../ai/tools/engenty-tools/lib/space-gate.js";
import {
  EngentyCoreHttpError,
  type EngentyToolContract,
} from "../ai/core-http-client.js";
import { createApiCatalogSearchStore } from "../dal/api-catalog/api-catalog-search-store.js";

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

const kbSearchContract = {
  ...contactsListContract,
  description: "Search Knowledge Base article content.",
  moduleId: "knowledge-base",
  operationId: "kb_search",
  pluginId: "knowledge-base",
  summary: "Search Knowledge Base content",
  toolId: "kb_search",
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

function createTestClient(
  overrides: Partial<EngentyToolsClient> = {}
): EngentyToolsClientResult {
  return {
    ok: true,
    client: {
      decideApproval: async () => ({}),
      describeTool: async () => contactsListContract,
      getWorkspaceContext: async () => ({
        canSwitchTenant: true,
        currentTenant: { id: "tenant-1", name: "Acme", slug: "acme" },
        isSuperAdmin: false,
        isTenantAdmin: true,
        onboarded: true,
        tenantRole: "admin" as const,
        tenantSupportedLocales: ["en", "de"],
        userId: "user-1",
      }),
      invokeTool: async <_TInput, TResult>() => ({}) as TResult,
      listAiAgents: async () => ({ agents: [] }),
      listModuleCapabilitySeeds: async () => ({ capabilities: [] }),
      listPlugins: async () => [],
      listToolContracts: async () => [],
      ...overrides,
    },
  };
}

function makeCatalog(contracts: EngentyToolContract[]) {
  return createApiCatalogSearchStore({
    loadContracts: async () => contracts,
  });
}

describe("Engenty Mastra tools", () => {
  it("surfaces core's 202 approval_required as a deny result when the contract did not flag it", async () => {
    // Core is authoritative: its 202 must gate even when the contract let the
    // call past the local pre-gate.
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

  it("names only Space-mounted modules when Space-bound", async () => {
    const result = await engentyToolsRunAls.run({ space: marketingSpace }, () =>
      listEngentyToolModules(
        createTestClient({
          listPlugins: async () =>
            ["projects", "offers"].map((id) => ({
              description: id,
              enabled: true,
              id,
              kind: "module",
              loaded: true,
              name: id,
              provides: [`module.${id}`],
            })),
          listToolContracts: async () => [projectsListContract],
        })
      )
    );

    if (!("modules" in result)) {
      throw new Error("expected modules envelope");
    }
    expect(result.modules.map((m) => m.moduleId)).toEqual(["projects"]);
  });

  it("marks a catalog hit as a contract, not app data", async () => {
    const result = await engentyToolsRunAls.run({ space: marketingSpace }, () =>
      searchEngentyTools(
        { kind: "tool", moduleId: "projects", query: "list" },
        {
          apiCatalog: makeCatalog([projectsListContract, contactsListContract]),
        }
      )
    );

    expect(result).toMatchObject({
      catalog_only: true,
      matches: [expect.objectContaining({ name: "projects_list" })],
    });
  });
});
