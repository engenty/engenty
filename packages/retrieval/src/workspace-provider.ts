// The unified cross-source search surface, packaged as a classic
// SearchIndexProvider so the host synthesizes the `core_workspace_search`
// tool through the exact same path as every module search tool.
// Read-only: it owns no documents (sources do), so replace/delete are no-ops.

import type { SearchIndexProvider, SearchRequest } from "@engenty/search-index";
import type {
  RetrievalMatch,
  RetrievalQueryFilters,
  RetrievalService,
} from "./contracts.js";

export const WORKSPACE_SEARCH_PROVIDER_ID = "core.workspace";

export function createWorkspaceSearchProvider(
  service: RetrievalService
): SearchIndexProvider<never, RetrievalQueryFilters, RetrievalMatch> {
  return {
    capabilities: { hybrid: true, lexical: true, semantic: true },
    deleteDocument: () => Promise.resolve(),
    id: WORKSPACE_SEARCH_PROVIDER_ID,
    replaceDocument: () => Promise.resolve(),
    search: (request: SearchRequest<RetrievalQueryFilters>) =>
      service.search(request),
    version: "1",
  };
}
