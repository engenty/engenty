// Current/stale/missing scan over source rows vs indexed documents. A row is
// stale when its source changed after indexing or when it was embedded by a
// model other than the one in effect.
// Scan-wide semantics shared with backfill target selection (copy source:
// the fixed inbox provider on feat/inbox-hybrid-search).

import type { SearchIndexStatus } from "@engenty/search-index";
import type { RetrievalSourceRegistration } from "./contracts.js";
import type { RetrievalStore } from "./store.js";

export const MAX_STATUS_SCAN = 5000;

const EMPTY_STATUS: SearchIndexStatus = {
  current_count: 0,
  indexed_count: 0,
  last_indexed_at: null,
  missing_count: 0,
  stale_count: 0,
  total_count: 0,
};

export interface ScanResult {
  /** Source doc ids needing (re-)index, newest-updated first. */
  pending: string[];
  status: SearchIndexStatus;
}

export async function scanIndexState(
  source: RetrievalSourceRegistration,
  store: RetrievalStore,
  tenantId: string,
  options: {
    /** The model in effect: rows embedded by any other model are stale. */
    embeddingModel: string;
    force?: boolean;
    metadata?: Record<string, string>;
  }
): Promise<ScanResult> {
  const trimmed = tenantId.trim();
  if (!trimmed) {
    return { pending: [], status: EMPTY_STATUS };
  }
  const sourceRows = await source.listDocuments({
    limit: MAX_STATUS_SCAN,
    ...(options.metadata ? { metadata: options.metadata } : {}),
    tenant_id: trimmed,
  });
  const indexed = await store.listIndexedDocs(trimmed, source.source_type);
  let current = 0;
  let stale = 0;
  let missing = 0;
  const pending: string[] = [];
  for (const row of sourceRows) {
    const state = indexed.get(row.doc_id);
    if (!state) {
      missing++;
      pending.push(row.doc_id);
      continue;
    }
    const isStale =
      state.embedding_model !== options.embeddingModel ||
      new Date(state.content_updated_at).getTime() <
        new Date(row.updated_at).getTime();
    if (isStale) {
      stale++;
      pending.push(row.doc_id);
    } else {
      current++;
      if (options.force) {
        pending.push(row.doc_id);
      }
    }
  }
  const lastIndexed = Array.from(indexed.values())
    .map((state) => state.indexed_at)
    .toSorted((a, b) => b.localeCompare(a))[0];
  return {
    pending,
    status: {
      current_count: current,
      indexed_count: indexed.size,
      last_indexed_at: lastIndexed ?? null,
      missing_count: missing,
      stale_count: stale,
      total_count: sourceRows.length,
    },
  };
}
