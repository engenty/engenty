import { bindingsFromList, setPlatformBindings } from "@engenty/ai-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import type { EngentyToolContract } from "../ai/core-http-client.js";
import {
  clearApiCatalogContractsCache,
  createApiCatalogSearchStore,
  createCoreCatalogContractSource,
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
    setPlatformBindings(
      bindingsFromList([
        {
          gateway: "vercel",
          modelId: "openai/text-embedding-3-small",
          role: "embedding",
        },
      ])
    );
    clearApiCatalogContractsCache();
    clearCatalogRankingEmbeddingCache();
    embedMock.mockReset();
    embedManyMock.mockReset();
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  });

  afterEach(() => {
    setPlatformBindings(undefined);
    vi.unstubAllEnvs();
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

  it("never serves one user's cached catalog to another user", async () => {
    // Core gates contracts per caller, so each bearer sees its own catalog.
    const catalogs: Record<string, EngentyToolContract[]> = {
      "token-a": [makeContract({ toolId: "contacts_list" })],
      "token-b": [
        makeContract({
          operationId: "contacts_delete",
          toolId: "contacts_delete",
        }),
      ],
    };
    const store = createApiCatalogSearchStore({
      sources: [
        {
          ...createCoreCatalogContractSource(),
          loadContracts: async () =>
            catalogs[engentyToolsRunAls.getStore()?.accessToken ?? ""] ?? [],
        },
      ],
    });
    const searchAs = (accessToken: string) =>
      engentyToolsRunAls.run({ accessToken }, () =>
        store.search({ filters: {}, limit: 10 })
      );

    await searchAs("token-a");
    const asB = await searchAs("token-b");

    expect(asB.results.map((r) => r.item.toolId)).toEqual(["contacts_delete"]);
  });
});
