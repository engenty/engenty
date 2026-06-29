// Unit coverage for the apps/ai `core_api_catalog` proxy store.
// Pins the legacy `engenty_tools_search` semantics (substring filter +
// additive scoring) and verifies that schema fidelity is preserved
// (the raw `EngentyToolContract` stays attached as `result.item`).

import { describe, expect, it } from "vitest";
import type { EngentyToolContract } from "../ai/core-http-client.js";
import { createApiCatalogSearchStore } from "../dal/api-catalog/api-catalog-search-store.js";

function makeContract(
  overrides: Partial<EngentyToolContract> = {}
): EngentyToolContract {
  return {
    auth: {
      requiredCapabilities: [],
      requiredPermissions: [],
      requiredScopes: [],
      requiresApproval: false,
      riskLevel: "low",
    },
    description: "List contacts",
    inputSchema: {
      hint: "{}",
      jsonSchema: { type: "object" },
      type: "zod",
    },
    methodName: "contacts_list",
    moduleId: "contacts",
    operationId: "contacts_list",
    outputSchema: {
      hint: "{}",
      jsonSchema: { type: "object" },
      type: "zod",
    },
    pluginId: "contacts",
    readOnly: true,
    summary: "List contacts",
    toolId: "contacts_list",
    transports: ["rest"],
    ...overrides,
  } as EngentyToolContract;
}

describe("createApiCatalogSearchStore", () => {
  it("filters by module_id and ranks query matches with the legacy scoring", async () => {
    const contracts = [
      makeContract({
        toolId: "contacts_delete",
        operationId: "contacts_delete",
        summary: "Delete contact",
        description: "Remove a contact row",
        readOnly: false,
        auth: {
          requiredCapabilities: [],
          requiredPermissions: [],
          requiredScopes: [],
          requiresApproval: true,
          riskLevel: "critical",
        },
      }),
      makeContract({
        toolId: "kb_search",
        operationId: "kb_search",
        moduleId: "knowledge-base",
        pluginId: "knowledge-base",
        summary: "Search Knowledge Base",
        description: "Search KB articles",
      }),
      makeContract(),
    ];
    const store = createApiCatalogSearchStore({
      loadContracts: async () => contracts,
    });

    const response = await store.search({
      filters: { kind: "tool", module_id: "contacts" },
      limit: 10,
      query: "list",
    });

    expect(response.total).toBe(1);
    expect(response.results[0]?.item.toolId).toBe("contacts_list");
    expect(response.results[0]?.item.inputSchema.jsonSchema).toEqual({
      type: "object",
    });
  });

  it("returns the full module roster when query is omitted", async () => {
    const contracts = [
      makeContract({
        toolId: "contacts_delete",
        operationId: "contacts_delete",
      }),
      makeContract(),
      makeContract({
        toolId: "kb_search",
        operationId: "kb_search",
        moduleId: "knowledge-base",
      }),
    ];
    const store = createApiCatalogSearchStore({
      loadContracts: async () => contracts,
    });

    const response = await store.search({
      filters: { kind: "tool", module_id: "contacts" },
      limit: 10,
    });

    expect(response.total).toBe(2);
    expect(response.results.map((r) => r.item.toolId).sort()).toEqual([
      "contacts_delete",
      "contacts_list",
    ]);
  });

  it("getStatus reports the catalog size and zero status fields when offline", async () => {
    const store = createApiCatalogSearchStore({
      loadContracts: async () => [
        makeContract(),
        makeContract({ toolId: "x" }),
      ],
    });
    const status = await store.getStatus?.({});
    expect(status?.total_count).toBe(2);
    expect(status?.indexed_count).toBe(2);
    expect(status?.last_indexed_at).toBeNull();
  });

  it("read_only_only filter excludes write contracts", async () => {
    const contracts = [
      makeContract({
        toolId: "contacts_delete",
        readOnly: false,
      }),
      makeContract(),
    ];
    const store = createApiCatalogSearchStore({
      loadContracts: async () => contracts,
    });

    const response = await store.search({
      filters: { kind: "tool", read_only_only: true },
      limit: 10,
    });

    expect(response.results.map((r) => r.item.toolId)).toEqual([
      "contacts_list",
    ]);
  });
});
