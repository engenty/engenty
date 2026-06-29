// `core_api_catalog` SearchIndexProvider.
//
// Wraps `buildApiCatalog` (which already merges OpenAPI HTTP routes with
// `buildOperationContracts` and applies per-tenant `provides`/override
// gating) as a `SearchIndexProvider` so it can flow through the unified
// search-index surface alongside chat-search/contacts/KB.
//
// The catalog is rebuilt from plugin manifests, not authored per-document,
// so `replaceDocument` / `deleteDocument` are no-ops and `backfill` simply
// stamps a new "rebuilt at" timestamp. `markRebuilt()` (returned alongside
// the provider) lets the host stamp the timestamp from outside (e.g. on
// `plugin.reload`).

import type {
  EngentyApiCatalogInput,
  EngentyApiCatalogResult,
} from "@engenty/ai-core";
import {
  resolveSearchStrategy,
  type SearchIndexProvider,
  type SearchRequest,
  type SearchResponse,
  type SearchStrategy,
} from "@engenty/search-index";
import type { CatalogSearchStrategy } from "./api-catalog-search.js";

export const CORE_API_CATALOG_PROVIDER_ID = "core_api_catalog";

export type ApiCatalogKindFilter = "all" | "http_route" | "tool";

export interface ApiCatalogSearchFilters {
  kind?: ApiCatalogKindFilter;
  module_id?: string;
  plugin_id?: string;
  read_only_only?: boolean;
  // Filled by the search route from the caller's bearer; the provider
  // forwards it to `buildApiCatalog` so per-tenant gating applies.
  tenant_id?: string | null;
}

export type ApiCatalogEntry = EngentyApiCatalogResult["matches"][number];

export interface CreateCoreApiCatalogProviderOptions {
  // Inject `buildApiCatalog` so the provider stays free of OpenAPI/registry
  // imports and the tenant-override resolver can be wired by the caller.
  buildApiCatalog: (params: {
    input: EngentyApiCatalogInput;
    tenantId?: string | null;
  }) => Promise<EngentyApiCatalogResult>;
}

export interface CoreApiCatalogProviderHandle {
  // Stamp `last_indexed_at`. Called once at registration time and again on
  // every successful `plugin.reload` so operators see a fresh timestamp on
  // the admin surface.
  markRebuilt(): void;
  provider: SearchIndexProvider<
    never,
    ApiCatalogSearchFilters,
    ApiCatalogEntry
  >;
}

export function createCoreApiCatalogSearchIndexProvider(
  options: CreateCoreApiCatalogProviderOptions
): CoreApiCatalogProviderHandle {
  let lastRebuildAt: string | null = null;
  let lastTotalCount = 0;

  const provider: SearchIndexProvider<
    never,
    ApiCatalogSearchFilters,
    ApiCatalogEntry
  > = {
    id: CORE_API_CATALOG_PROVIDER_ID,
    capabilities: { hybrid: true, lexical: true, semantic: true },
    version: "1",

    async deleteDocument(): Promise<void> {
      // Catalog is rebuilt from plugin manifests; per-doc delete is a no-op.
    },

    async replaceDocument(): Promise<void> {
      // Catalog is rebuilt from plugin manifests; per-doc replace is a no-op.
    },

    async backfill(): Promise<{
      failed: number;
      processed: number;
      results: never[];
    }> {
      // Re-stamp; the catalog itself rebuilds per call so there is no
      // separate "ingestion" job to run.
      lastRebuildAt = new Date().toISOString();
      return { failed: 0, processed: 0, results: [] };
    },

    async getStatus(filters): Promise<{
      current_count: number;
      indexed_count: number;
      last_indexed_at: string | null;
      missing_count: number;
      stale_count: number;
      total_count: number;
    }> {
      try {
        const result = await options.buildApiCatalog({
          input: { limit: 1 },
          tenantId: filters?.tenant_id ?? null,
        });
        lastTotalCount = result.total;
      } catch {
        // Status must never fail the operator UI — fall back to last known.
      }
      return {
        current_count: lastTotalCount,
        indexed_count: lastTotalCount,
        last_indexed_at: lastRebuildAt,
        missing_count: 0,
        stale_count: 0,
        total_count: lastTotalCount,
      };
    },

    async search(
      request: SearchRequest<ApiCatalogSearchFilters>
    ): Promise<SearchResponse<ApiCatalogEntry>> {
      const strategy: SearchStrategy = resolveSearchStrategy(
        { capabilities: this.capabilities },
        request
      );
      const filters = request.filters ?? {};
      const result = await options.buildApiCatalog({
        input: {
          kind: filters.kind ?? "all",
          limit: request.limit ?? 10,
          ...(filters.module_id ? { moduleId: filters.module_id } : {}),
          ...(filters.plugin_id ? { pluginId: filters.plugin_id } : {}),
          ...(filters.read_only_only ? { readOnlyOnly: true } : {}),
          ...(request.query ? { query: request.query } : {}),
          strategy: strategy as CatalogSearchStrategy,
        },
        tenantId: filters.tenant_id ?? null,
      });
      lastTotalCount = result.total;
      return {
        results: result.matches.map((item) => ({
          item,
          matched_fields: [],
          score: 1,
          source_scores: { lexical: 1 },
        })),
        total: result.total,
      };
    },
  };

  return {
    provider,
    markRebuilt() {
      lastRebuildAt = new Date().toISOString();
    },
  };
}
