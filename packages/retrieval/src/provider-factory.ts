// Manufactures a classic `SearchIndexProvider` from a source registration so
// the existing registry, synthesized tools, admin routes, and event bindings
// work unchanged. This is the compatibility seam that makes migration
// incremental: consumers of the provider interface cannot tell a managed
// source from a hand-rolled provider.

import type {
  SearchDocument,
  SearchIndexProvider,
  SearchIndexProviderConfig,
  SearchIndexStatus,
  SearchRequest,
  SearchResponse,
} from "@engenty/search-index";
import { runBackfill } from "./backfill.js";
import {
  DEFAULT_RETRIEVAL_EMBEDDING_MODEL,
  type RetrievalDocument,
  type RetrievalQueryFilters,
  type RetrievalSourceRegistration,
} from "./contracts.js";
import type { IngestDeps } from "./ingest.js";
import { ingestDocument } from "./ingest.js";
import { type QueryDeps, runQuery } from "./query.js";
import { scanIndexState } from "./status.js";

const CAPABILITIES = { hybrid: true, lexical: true, semantic: true } as const;

// Snapshot the source's effective retrieval config for the admin UI. Values
// that resolve per-tenant at query time (KB's similarity floor, KB's embedding
// model) cannot be shown as a single number, so they report `*Dynamic: true`
// with a null literal rather than a misleading static value.
function buildProviderConfig(
  source: RetrievalSourceRegistration
): SearchIndexProviderConfig {
  const vectorThreshold = source.retriever?.vectorThreshold;
  const staticModel = source.embedding?.model;
  const modelDynamic =
    !staticModel && typeof source.embedding?.resolveModel === "function";
  return {
    embeddingModel:
      staticModel ?? (modelDynamic ? null : DEFAULT_RETRIEVAL_EMBEDDING_MODEL),
    embeddingModelDynamic: modelDynamic,
    fastPathMaxTerms: source.retriever?.fastPath?.maxTerms ?? null,
    splitter: source.splitter.mode,
    useTrigram: source.retriever?.useTrigram ?? false,
    vectorThreshold:
      typeof vectorThreshold === "number" ? vectorThreshold : null,
    vectorThresholdDynamic: typeof vectorThreshold === "function",
    visibility: source.visibility,
  };
}

export function createManagedProvider(
  source: RetrievalSourceRegistration,
  deps: { ingest: IngestDeps; query: QueryDeps; ready: () => Promise<void> }
): SearchIndexProvider<SearchDocument, Record<string, unknown>, unknown> {
  async function search(
    request: SearchRequest<Record<string, unknown>>
  ): Promise<SearchResponse<unknown>> {
    await deps.ready();
    const moduleFilters = request.filters ?? {};
    const mapped = source.retriever?.mapFilters
      ? source.retriever.mapFilters(moduleFilters)
      : {};
    // Space containment is injected by the host (never mapped from a module's
    // own filter shape) and forwarded as-is; an empty array must survive.
    const spaceIds = Array.isArray(moduleFilters.space_ids)
      ? moduleFilters.space_ids.filter(
          (value): value is string => typeof value === "string"
        )
      : undefined;
    const filters: RetrievalQueryFilters = {
      ...mapped,
      ...(spaceIds ? { space_ids: spaceIds } : {}),
      scope_id:
        mapped.scope_id ??
        (typeof moduleFilters.scope_id === "string"
          ? moduleFilters.scope_id
          : null),
      source_types: [source.source_type],
      tenant_id:
        typeof moduleFilters.tenant_id === "string"
          ? moduleFilters.tenant_id
          : null,
      user_id:
        typeof moduleFilters.user_id === "string"
          ? moduleFilters.user_id
          : null,
    };
    return runQuery(deps.query, { ...request, filters });
  }

  return {
    backfill: async (input) => {
      await deps.ready();
      return runBackfill(deps.ingest, input ?? {});
    },
    capabilities: CAPABILITIES,
    config: buildProviderConfig(source),
    deleteDocument: async (input) => {
      await deps.ready();
      await deps.ingest.store.deleteDocument({
        docId: input.doc_id,
        sourceType: source.source_type,
        tenantId: input.tenant_id,
      });
    },
    getDocumentById: async (input) => {
      const document = await source.buildDocument(input);
      return document ?? null;
    },
    getStatus: async (input) => {
      await deps.ready();
      const tenantId = input?.tenant_id?.trim();
      if (!tenantId) {
        return EMPTY_STATUS;
      }
      const { status } = await scanIndexState(
        source,
        deps.ingest.store,
        tenantId
      );
      return status;
    },
    id: source.source_type,
    replaceDocument: async (input) => {
      await deps.ready();
      // The declarative event binding hands back whatever getDocumentById
      // returned — a RetrievalDocument.
      await ingestDocument(deps.ingest, input.document as RetrievalDocument);
    },
    search,
    version: "1",
  };
}

const EMPTY_STATUS: SearchIndexStatus = {
  current_count: 0,
  indexed_count: 0,
  last_indexed_at: null,
  missing_count: 0,
  stale_count: 0,
  total_count: 0,
};
