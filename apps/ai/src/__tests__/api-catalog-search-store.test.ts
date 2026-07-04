// Unit coverage for the apps/ai `core_api_catalog` store.
// Verifies the shared lexical (BM25) ranking, the semantic/hybrid embedding
// path with its lexical fallback, the contracts TTL cache, and that schema
// fidelity is preserved (the raw `EngentyToolContract` stays attached as
// `result.item`).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EngentyToolContract } from "../ai/core-http-client.js";
import {
  clearApiCatalogContractsCache,
  createApiCatalogSearchStore,
} from "../dal/api-catalog/api-catalog-search-store.js";
import { clearCatalogRankingEmbeddingCache } from "../dal/api-catalog/catalog-ranking.js";

const { embedManyMock, embedMock } = vi.hoisted(() => ({
  embedManyMock: vi.fn(),
  embedMock: vi.fn(),
}));

vi.mock("ai", () => ({
  embed: embedMock,
  embedMany: embedManyMock,
}));

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
  beforeEach(() => {
    clearApiCatalogContractsCache();
    clearCatalogRankingEmbeddingCache();
    embedMock.mockReset();
    embedManyMock.mockReset();
    // Default to lexical-only: no gateway credentials.
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("filters by module_id and ranks query matches lexically", async () => {
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
    expect(response.results[0]?.item.inputSchema?.jsonSchema).toEqual({
      type: "object",
    });
    expect(embedMock).not.toHaveBeenCalled();
    expect(embedManyMock).not.toHaveBeenCalled();
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

  it("ranks semantically when gateway credentials are available", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
    const contracts = [
      makeContract({
        toolId: "contacts_find_counsel",
        operationId: "contacts_find_counsel",
        summary: "Find counsel contacts",
        description:
          "Discover retained outside counsel and legal representatives.",
      }),
      makeContract({
        toolId: "kb_search",
        operationId: "kb_search",
        moduleId: "knowledge-base",
        summary: "Search Knowledge Base",
        description: "Search KB articles",
      }),
    ];
    embedMock.mockResolvedValueOnce({ embedding: [1, 0] });
    embedManyMock.mockResolvedValueOnce({
      embeddings: [
        [1, 0],
        [0, 1],
      ],
    });
    const store = createApiCatalogSearchStore({
      loadContracts: async () => contracts,
    });

    // "advocate" has no lexical overlap with either contract — only the
    // (mocked) embedding similarity can surface the counsel tool.
    const response = await store.search({
      filters: { kind: "tool" },
      limit: 10,
      query: "advocate",
      strategy: "semantic",
    });

    expect(response.results.map((r) => r.item.toolId)).toEqual([
      "contacts_find_counsel",
    ]);
    expect(response.results[0]?.source_scores.semantic).toBeGreaterThan(0.9);
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(embedManyMock).toHaveBeenCalledTimes(1);
  });

  it("blends semantic and lexical scores for hybrid ranking", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
    const contracts = [
      makeContract(),
      makeContract({
        toolId: "contacts_export",
        operationId: "contacts_export",
        summary: "Export contacts",
        description: "Export the contact list as CSV",
      }),
    ];
    embedMock.mockResolvedValueOnce({ embedding: [1, 0] });
    embedManyMock.mockResolvedValueOnce({
      embeddings: [
        [0.2, 0.8],
        [1, 0],
      ],
    });
    const store = createApiCatalogSearchStore({
      loadContracts: async () => contracts,
    });

    const response = await store.search({
      filters: { kind: "tool" },
      limit: 10,
      query: "export",
      strategy: "hybrid",
    });

    // contacts_export wins on both signals; contacts_list survives only if
    // it has any signal at all (it has neither for "export" beyond cosine).
    expect(response.results[0]?.item.toolId).toBe("contacts_export");
    expect(response.results[0]?.source_scores.lexical).toBeGreaterThan(0);
    expect(response.results[0]?.source_scores.semantic).toBeGreaterThan(0.9);
  });

  it("falls back to lexical ranking when embeddings fail", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
    embedMock.mockRejectedValueOnce(new Error("401 Unauthorized"));
    embedManyMock.mockRejectedValueOnce(new Error("401 Unauthorized"));
    const store = createApiCatalogSearchStore({
      loadContracts: async () => [makeContract()],
    });

    const response = await store.search({
      filters: { kind: "tool" },
      limit: 10,
      query: "list contacts",
      strategy: "hybrid",
    });

    expect(response.results.map((r) => r.item.toolId)).toEqual([
      "contacts_list",
    ]);
  });

  it("caches contracts per source within the TTL", async () => {
    const loadContracts = vi.fn(async () => [makeContract()]);
    const store = createApiCatalogSearchStore({
      contractsTtlMs: 60_000,
      sources: [
        {
          cacheKey: () => "user-token-1",
          id: "core",
          loadContracts,
        },
      ],
    });

    await store.search({ filters: {}, limit: 10, query: "list" });
    await store.search({ filters: {}, limit: 10, query: "contacts" });

    expect(loadContracts).toHaveBeenCalledTimes(1);
  });

  it("does not cache contracts when the source opts out", async () => {
    const loadContracts = vi.fn(async () => [makeContract()]);
    const store = createApiCatalogSearchStore({
      contractsTtlMs: 60_000,
      sources: [
        {
          cacheKey: () => null,
          id: "core",
          loadContracts,
        },
      ],
    });

    await store.search({ filters: {}, limit: 10, query: "list" });
    await store.search({ filters: {}, limit: 10, query: "list" });

    expect(loadContracts).toHaveBeenCalledTimes(2);
  });

  it("merges contracts from multiple sources into one ranked catalog", async () => {
    const store = createApiCatalogSearchStore({
      sources: [
        {
          cacheKey: () => null,
          id: "core",
          loadContracts: async () => [makeContract()],
        },
        {
          cacheKey: () => null,
          id: "external",
          loadContracts: async () => [
            makeContract({
              toolId: "stripe_list_charges",
              operationId: "stripe_list_charges",
              moduleId: "stripe",
              pluginId: "stripe",
              summary: "List charges",
              description: "List Stripe charges",
            }),
          ],
        },
      ],
    });

    const response = await store.search({
      filters: { kind: "tool" },
      limit: 10,
      query: "list",
    });

    expect(response.results.map((r) => r.item.toolId).sort()).toEqual([
      "contacts_list",
      "stripe_list_charges",
    ]);
  });
});
