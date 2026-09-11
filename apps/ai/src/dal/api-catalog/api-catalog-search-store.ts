// `core_api_catalog` `SearchIndexProvider` for in-process consumption in
// apps/ai (Mastra tools, future admin surfaces).
//
// Catalog BUILDING stays in apps/core (it needs the plugin registry and the
// live OpenAPI document); this provider fetches the user-scoped, tenant-gated
// tool contracts from core (`/api/tools/contracts`, full JSON Schemas) and
// ranks them here: shared lexical BM25 from @engenty/search-index plus
// semantic embedding reranking (see catalog-ranking.ts). Core itself ranks
// lexically only — apps/ai is where gateway credentials live.
//
// Contract sources are pluggable via `CatalogContractSource`: an external
// (non-core) source normalizes its API surface (e.g. an OpenAPI spec) into
// `EngentyToolContract[]` and is merged into the same ranked catalog. Only
// the core source is implemented today.
//
// Returning the raw `EngentyToolContract` as `result.item` keeps schema
// fidelity intact for the LLM tool wrapper.

import {
  type CatalogRankStrategy,
  resolveSearchStrategy,
  type SearchIndexProvider,
  type SearchRequest,
  type SearchResponse,
} from "@engenty/search-index";
import { resolveEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import {
  EngentyCoreClient,
  EngentyCoreHttpError,
  type EngentyToolContract,
  getEngentyCoreBaseUrlFromEnv,
} from "../../ai/core-http-client.js";
import { rankContracts } from "./catalog-ranking.js";

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

/**
 * A source of tool contracts to include in the searchable catalog.
 * External catalogs plug in here: normalize the external API surface into
 * `EngentyToolContract[]` and the contracts flow through the same filter +
 * ranking pipeline as core's.
 */
export interface CatalogContractSource {
  /**
   * Cache partition key for this source's contracts — e.g. the end-user
   * bearer for the core source, since core gates contracts per caller.
   * Return null to bypass the contracts cache entirely.
   */
  cacheKey?: () => string | null;
  id: string;
  loadContracts: () => Promise<EngentyToolContract[]>;
}

export interface CreateApiCatalogSearchStoreOptions {
  /** Contracts cache TTL; 0 disables caching. */
  contractsTtlMs?: number;
  // Override the contract loader for tests so the proxy does not need a
  // live core HTTP endpoint. Wrapped as a single uncached source unless
  // `sources` is given.
  loadContracts?: () => Promise<EngentyToolContract[]>;
  /** Contract sources; defaults to the core `/api/tools/contracts` source. */
  sources?: CatalogContractSource[];
}

export type ApiCatalogSearchStore = SearchIndexProvider<
  never,
  AiApiCatalogSearchFilters,
  EngentyToolContract
>;

const DEFAULT_CONTRACTS_TTL_MS = 60_000;

// Module-level so the per-run fallback store in `engenty_tools_search`
// (created ad hoc when the registry is unavailable) still hits the cache.
const contractsCache = new Map<
  string,
  { contracts: EngentyToolContract[]; expiresAt: number }
>();

export function clearApiCatalogContractsCache() {
  contractsCache.clear();
}

export function createCoreCatalogContractSource(): CatalogContractSource {
  return {
    id: "core",
    // Contracts are gated per caller on the core side, so partition the
    // cache by the end-user bearer.
    cacheKey: () => resolveEngentyToolsRunContext().accessToken?.trim() || null,
    loadContracts: () => loadContractsFromCore(),
  };
}

export function createApiCatalogSearchStore(
  options: CreateApiCatalogSearchStoreOptions = {}
): ApiCatalogSearchStore {
  const sources: CatalogContractSource[] = options.sources
    ? options.sources
    : options.loadContracts
      ? // Injected loaders bypass the module-level cache (test isolation);
        // pass `sources` with a cacheKey to exercise caching explicitly.
        [
          {
            cacheKey: () => null,
            id: "injected",
            loadContracts: options.loadContracts,
          },
        ]
      : [createCoreCatalogContractSource()];
  const ttlMs = options.contractsTtlMs ?? DEFAULT_CONTRACTS_TTL_MS;

  async function loadSourceContracts(
    source: CatalogContractSource
  ): Promise<EngentyToolContract[]> {
    const partition = source.cacheKey?.();
    const cacheable = ttlMs > 0 && partition !== null;
    const cacheKey = `${source.id}:${partition ?? ""}`;
    if (cacheable) {
      const cached = contractsCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.contracts;
      }
    }
    const contracts = await source.loadContracts();
    if (cacheable) {
      contractsCache.set(cacheKey, {
        contracts,
        expiresAt: Date.now() + ttlMs,
      });
    }
    return contracts;
  }

  async function loadAllContracts(): Promise<EngentyToolContract[]> {
    const perSource = await Promise.all(
      sources.map((source) => loadSourceContracts(source))
    );
    return perSource.flat();
  }

  return {
    id: CORE_API_CATALOG_PROVIDER_ID,
    capabilities: { hybrid: true, lexical: true, semantic: true },
    version: "2",

    async deleteDocument(): Promise<void> {},
    async replaceDocument(): Promise<void> {},

    async getStatus() {
      let total = 0;
      try {
        total = (await loadAllContracts()).length;
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
      const contracts = await loadAllContracts();
      const limit = request.limit ?? 10;
      const filtered = contracts.filter((c) => matchesFilters(c, filters));
      const query = request.query?.trim();

      if (!query) {
        // No query: keep the legacy static ordering (module bonus, read-only
        // bonus, risk penalties) so module browsing stays stable.
        const matched = filtered
          .map((c) => ({ contract: c, score: staticScore(c, filters) }))
          .sort((a, b) => b.score - a.score);
        return {
          results: matched.slice(0, limit).map((entry) => ({
            item: entry.contract,
            matched_fields: [],
            score: entry.score,
            source_scores: { lexical: entry.score },
          })),
          total: matched.length,
        };
      }

      const strategy = resolveSearchStrategy(
        { capabilities: this.capabilities },
        request
      ) as CatalogRankStrategy;
      const ranked = await rankContracts(filtered, { query, strategy });
      return {
        results: ranked.slice(0, limit).map((entry) => ({
          item: entry.contract,
          matched_fields: [],
          score: entry.score,
          source_scores: {
            lexical: entry.lexical,
            ...(entry.semantic > 0 ? { semantic: entry.semantic } : {}),
          },
        })),
        total: ranked.length,
      };
    },
  };
}

async function loadContractsFromCore(): Promise<EngentyToolContract[]> {
  const ctx = resolveEngentyToolsRunContext();
  const accessToken = ctx.accessToken?.trim();
  if (!accessToken) {
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
    accessToken,
  });
  return await client.listToolContracts();
}

function matchesFilters(
  contract: EngentyToolContract,
  filters: AiApiCatalogSearchFilters
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
  return true;
}

// Query-less ordering bonuses, carried over from the legacy heuristic scorer.
function staticScore(
  contract: EngentyToolContract,
  filters: AiApiCatalogSearchFilters
): number {
  let score = 0;
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
