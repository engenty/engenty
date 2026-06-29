// `core_api_catalog` `SearchIndexProvider` for in-process consumption in
// apps/ai (Mastra tools, future admin surfaces).
//
// The real, OpenAPI-aware api-catalog provider lives in apps/core (see
// `apps/core/src/api/api-catalog-provider.ts`); apps/ai cannot host it
// because the plugin registry it needs lives in another process. To
// still expose the catalog through the unified `SearchIndexProvider`
// contract on the agent's side — so that `engenty_tools_search` and
// future consumers go through `provider.search(...)` instead of forking
// their own scoring — this proxy fetches the user-scoped tool contracts
// from `apps/core` `/api/tools/contracts` (full JSON Schemas, tenant
// `provides`-gated) and applies the same simple substring + additive
// scoring `engenty_tools_search` used historically. Returning the raw
// `EngentyToolContract` as `result.item` keeps schema fidelity intact
// for the LLM tool wrapper.

import type {
  SearchIndexProvider,
  SearchRequest,
  SearchResponse,
} from "@engenty/search-index";
import { resolveEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import {
  EngentyCoreClient,
  EngentyCoreHttpError,
  type EngentyToolContract,
  getEngentyCoreBaseUrlFromEnv,
} from "../../ai/core-http-client.js";

export const CORE_API_CATALOG_PROVIDER_ID = "core_api_catalog";

export type ApiCatalogKindFilter = "all" | "tool";

export interface AiApiCatalogSearchFilters {
  kind?: ApiCatalogKindFilter;
  module_id?: string;
  read_only_only?: boolean;
  // The route / tool fills these from the caller scope; the provider does
  // not enforce gating itself (apps/core does, with the user bearer).
  tenant_id?: string | null;
  user_id?: string | null;
}

export interface CreateApiCatalogSearchStoreOptions {
  // Override the contract loader for tests so the proxy does not need a
  // live core HTTP endpoint.
  loadContracts?: () => Promise<EngentyToolContract[]>;
}

export type ApiCatalogSearchStore = SearchIndexProvider<
  never,
  AiApiCatalogSearchFilters,
  EngentyToolContract
>;

export function createApiCatalogSearchStore(
  options: CreateApiCatalogSearchStoreOptions = {}
): ApiCatalogSearchStore {
  const loadContracts =
    options.loadContracts ?? (async () => loadContractsFromCore());

  return {
    id: CORE_API_CATALOG_PROVIDER_ID,
    capabilities: { hybrid: false, lexical: true, semantic: false },
    version: "1",

    async deleteDocument(): Promise<void> {},
    async replaceDocument(): Promise<void> {},

    async getStatus() {
      let total = 0;
      try {
        total = (await loadContracts()).length;
      } catch {
        // Status is best-effort over the wire; surface zero on transient errors.
      }
      return {
        current_count: total,
        indexed_count: total,
        last_indexed_at: null,
        missing_count: 0,
        stale_count: 0,
        total_count: total,
      };
    },

    async search(
      request: SearchRequest<AiApiCatalogSearchFilters>
    ): Promise<SearchResponse<EngentyToolContract>> {
      const filters = request.filters ?? {};
      const contracts = await loadContracts();
      const limit = request.limit ?? 10;
      const matched = contracts
        .filter((c) => matchesFilters(c, filters, request.query))
        .map((c) => ({
          contract: c,
          score: scoreContract(c, filters, request.query),
        }))
        .sort((a, b) => b.score - a.score);
      const total = matched.length;
      const window = matched.slice(0, limit);
      return {
        results: window.map((entry) => ({
          item: entry.contract,
          matched_fields: [],
          score: entry.score,
          source_scores: { lexical: entry.score },
        })),
        total,
      };
    },
  };
}

async function loadContractsFromCore(): Promise<EngentyToolContract[]> {
  const ctx = resolveEngentyToolsRunContext();
  const userAccessToken = ctx.userAccessToken?.trim();
  if (!userAccessToken) {
    // Preserve legacy `engenty_tools_search` error envelope so callers
    // see `code: "unauthorized"` not a generic execution failure.
    throw new EngentyCoreHttpError(
      "Core-backed Engenty tools are unavailable because this run does not include an end-user bearer token.",
      401,
      "unauthorized"
    );
  }
  const coreBaseUrl = ctx.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
  if (!coreBaseUrl) {
    throw new EngentyCoreHttpError(
      "Core-backed Engenty tools are unavailable because ENGENTY_CORE_BASE_URL is not configured.",
      503,
      "service_unavailable"
    );
  }
  const client = new EngentyCoreClient({
    coreBaseUrl,
    fetchImpl: ctx.fetchImpl,
    userAccessToken,
  });
  return await client.listToolContracts();
}

function matchesFilters(
  contract: EngentyToolContract,
  filters: AiApiCatalogSearchFilters,
  query: string | undefined
): boolean {
  // `engenty_tools_search` is operation-focused: `kind` is either "all"
  // (default) or "tool". Everything coming from `/api/tools/contracts` is
  // already a tool, so `kind` is effectively a no-op filter today.
  if (
    filters.kind === "tool" ||
    filters.kind === "all" ||
    filters.kind == null
  ) {
    // accept
  } else {
    return false;
  }
  if (filters.module_id && contract.moduleId !== filters.module_id) {
    return false;
  }
  if (filters.read_only_only && !contract.readOnly) {
    return false;
  }
  if (!query) {
    return true;
  }
  // Match the legacy `engenty_tools_search` haystack (toolId, moduleId,
  // pluginId, title/summary, description, required capabilities).
  // `methodName` is intentionally excluded — it's an internal handler id
  // that callers should not have to think about.
  const id = contract.toolId ?? contract.operationId ?? contract.methodName;
  const haystack = [
    id,
    contract.moduleId,
    contract.pluginId,
    contract.summary,
    contract.description,
    ...(contract.auth?.requiredCapabilities ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function scoreContract(
  contract: EngentyToolContract,
  filters: AiApiCatalogSearchFilters,
  query: string | undefined
): number {
  let score = 0;
  if (query) {
    const q = query.toLowerCase();
    const id = (contract.toolId ?? contract.operationId ?? "").toLowerCase();
    const title = (contract.summary ?? "").toLowerCase();
    const description = (contract.description ?? "").toLowerCase();
    if (id === q) {
      score += 100;
    }
    if (id.includes(q)) {
      score += 25;
    }
    if (title.includes(q)) {
      score += 15;
    }
    if (description.includes(q)) {
      score += 10;
    }
  }
  if (filters.module_id && contract.moduleId === filters.module_id) {
    score += 20;
  }
  if (contract.readOnly) {
    score += 5;
  }
  if (contract.auth?.riskLevel === "high") {
    score -= 5;
  }
  if (contract.auth?.riskLevel === "critical") {
    score -= 10;
  }
  return score;
}
