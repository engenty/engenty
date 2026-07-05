// Manufactures a classic `SearchIndexProvider` from a source registration so
// the existing registry, synthesized tools, admin routes, and event bindings
// work unchanged. This is the compatibility seam that makes migration
// incremental: consumers of the provider interface cannot tell a managed
// source from a hand-rolled provider.

import type {
  SearchDocument,
  SearchIndexProvider,
  SearchIndexStatus,
  SearchRequest,
  SearchResponse,
} from "@engenty/search-index";
import type {
  RetrievalDocument,
  RetrievalQueryFilters,
  RetrievalSourceRegistration,
} from "./contracts.js";
import type { IngestDeps } from "./ingest.js";
import { ingestDocument } from "./ingest.js";
import { runBackfill } from "./backfill.js";
import { runQuery, type QueryDeps } from "./query.js";
import { scanIndexState } from "./status.js";

const CAPABILITIES = { hybrid: true, lexical: true, semantic: true } as const;

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
    const filters: RetrievalQueryFilters = {
      ...mapped,
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
