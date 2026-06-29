// Thin client over apps/ai's per-user `/ai/v1/search-index/*` surface,
// scoped to the chat-search provider (`ai_chat_search`). The dev settings
// panel uses these helpers; previously this file talked to the bespoke
// `/v1/search/chats*` routes which have been retired.

import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";
import { config } from "./config";

const CHAT_SEARCH_PROVIDER_ID = "ai_chat_search";

// Unified `SearchIndexStatus` (apps/ai per-user surface).
export interface SearchIndexStatus {
  current_count: number;
  indexed_count: number;
  last_indexed_at: string | null;
  missing_count: number;
  stale_count: number;
  total_count: number;
}

export interface ChatSearchSidebarMatch {
  doc_id: string;
  item: {
    session_id: string;
    text: string;
  };
  score: number;
}

export interface ChatSearchQueryResponse {
  matches: ChatSearchSidebarMatch[];
  total: number;
}

export interface SearchIndexBackfillResponse {
  failed?: number;
  processed?: number;
  results?: unknown[];
}

async function requestSearchIndexJson<T>(
  path: string,
  options: {
    body?: unknown;
    method?: "GET" | "POST";
    signal?: AbortSignal;
  } = {}
) {
  const baseUrl = config.aiBaseUrl.trim().replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  const token = await getCurrentAccessToken();
  return await requestApiJson<T>(path, {
    baseUrl,
    method: options.method ?? "GET",
    body: options.body as BodyInit | Record<string, unknown> | undefined,
    signal: options.signal,
    ...(token ? { authToken: token } : {}),
  });
}

export async function getChatSearchIndexStatus(signal?: AbortSignal) {
  const response = await requestSearchIndexJson<{
    id: string;
    status: SearchIndexStatus;
  }>(`/ai/v1/search-index/providers/${CHAT_SEARCH_PROVIDER_ID}/status`, {
    method: "GET",
    signal,
  });
  return response.status;
}

export async function reindexChatSearchIndex(input: { limit?: number }) {
  const response = await requestSearchIndexJson<{
    id: string;
    result: SearchIndexBackfillResponse;
  }>(`/ai/v1/search-index/providers/${CHAT_SEARCH_PROVIDER_ID}/backfill`, {
    method: "POST",
    body: input.limit == null ? {} : { limit: input.limit },
  });
  return response.result;
}

export async function searchChatIndex(
  query: string,
  signal?: AbortSignal,
  limit = 25
) {
  const response = await requestSearchIndexJson<{
    id: string;
    matches: ChatSearchSidebarMatch[];
    total: number;
  }>(`/ai/v1/search-index/providers/${CHAT_SEARCH_PROVIDER_ID}/search`, {
    method: "POST",
    signal,
    body: {
      limit,
      query,
    },
  });
  return {
    matches: response.matches,
    total: response.total,
  };
}
