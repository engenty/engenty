import { request } from "./http";

export interface SearchIndexProvider {
  capabilities: string[];
  config: Record<string, unknown> | null;
  entity_name: string;
  id: string;
  is_system: boolean;
  module_id: string;
  operation_id: string | null;
  registered_at: string;
  supports: { backfill: boolean; search: boolean; status: boolean };
  version: string;
}

export type SearchIndexStatus = Record<string, unknown>;

export interface SearchIndexMatch {
  score?: number;
  [key: string]: unknown;
}

export interface SearchIndexSearchResult {
  id: string;
  matches: SearchIndexMatch[];
  total: number;
}

export type SearchStrategy = "hybrid" | "semantic" | "lexical";

export function listSearchProviders(signal?: AbortSignal) {
  return request<{ providers: SearchIndexProvider[] }>(
    "/api/search-index/providers",
    { signal }
  ).then((r) => r.providers);
}

export function getSearchProviderStatus(id: string, signal?: AbortSignal) {
  return request<{ id: string; status: SearchIndexStatus }>(
    `/api/search-index/providers/${encodeURIComponent(id)}/status`,
    { signal }
  ).then((r) => r.status);
}

export function searchProvider(
  id: string,
  body: { query: string; strategy: SearchStrategy; limit?: number }
) {
  return request<SearchIndexSearchResult>(
    `/api/search-index/providers/${encodeURIComponent(id)}/search`,
    { method: "POST", body }
  );
}
