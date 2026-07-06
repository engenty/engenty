// Admin client for the unified search-index console (/settings/search-index).
//
// Providers live in two registries: the core process (`/api/search-index/*` —
// kb.article, contacts.contact, inbox.message) and the apps/ai process
// (`/ai/v1/search-index/*` — ai_chat_search, core_api_catalog). This client
// queries both, tags each provider with its `origin`, and routes every
// status/search/backfill call back to the right surface. Core status/backfill
// run tenant-wide for an admin; the AI surface is self-scoped to the caller
// (chat transcripts are per-user), which the UI flags on the provider card.

import { requestApiJson } from "@engenty/api-client";
import { config } from "./config";

const CORE_PATH = "/api/search-index";
const AI_PATH = "/ai/v1/search-index";

export type ProviderOrigin = "ai" | "core";

export interface SearchIndexProviderConfig {
  embeddingModel?: string | null;
  embeddingModelDynamic?: boolean;
  fastPathMaxTerms?: number | null;
  splitter?: string;
  useTrigram?: boolean;
  vectorThreshold?: number | null;
  vectorThresholdDynamic?: boolean;
  visibility?: string;
}

export interface SearchIndexProviderCapabilities {
  hybrid?: boolean;
  lexical?: boolean;
  semantic?: boolean;
}

export interface SearchIndexProviderSummary {
  capabilities: SearchIndexProviderCapabilities;
  config: SearchIndexProviderConfig | null;
  entity_name: string;
  id: string;
  is_system: boolean;
  module_id: string;
  operation_id: string | null;
  origin: ProviderOrigin;
  registered_at: string;
  supports: { backfill?: boolean; search?: boolean; status?: boolean };
  version: string;
}

export interface SearchIndexStatus {
  current_count: number;
  indexed_count: number;
  last_indexed_at: string | null;
  missing_count: number;
  stale_count: number;
  total_count: number;
}

export interface SearchIndexMatch {
  item: unknown;
  matched_fields: string[];
  score: number;
  source_scores: Record<string, number | undefined>;
}

export interface SearchIndexBackfillResult {
  failed?: number;
  processed?: number;
  results?: Array<{ doc_id?: string; error?: string; ok?: boolean }>;
}

export interface SearchIndexTestSearchResult {
  elapsed_ms: number;
  matches: SearchIndexMatch[];
  total: number;
}

export interface SearchIndexTestSearchInput {
  limit?: number;
  min_score?: number;
  query: string;
  strategy?: "hybrid" | "lexical" | "semantic";
}

function surface(origin: ProviderOrigin): {
  base: string;
  options: { baseUrl?: string };
} {
  return origin === "ai"
    ? { base: AI_PATH, options: { baseUrl: config.aiBaseUrl } }
    : { base: CORE_PATH, options: {} };
}

async function fetchProviders(
  origin: ProviderOrigin
): Promise<SearchIndexProviderSummary[]> {
  const { base, options } = surface(origin);
  const response = await requestApiJson<{
    providers?: Omit<SearchIndexProviderSummary, "origin">[];
  }>(`${base}/providers`, { method: "GET", ...options });
  return (response.providers ?? []).map((provider) => ({
    ...provider,
    origin,
  }));
}

/**
 * All providers across both registries, deduped by id (core wins if a provider
 * somehow appears in both). Each registry is queried independently: if the AI
 * surface is unreachable, core providers still render.
 */
export async function listAllProviders(): Promise<
  SearchIndexProviderSummary[]
> {
  const settled = await Promise.allSettled([
    fetchProviders("core"),
    fetchProviders("ai"),
  ]);
  const byId = new Map<string, SearchIndexProviderSummary>();
  for (const result of settled) {
    if (result.status !== "fulfilled") {
      continue;
    }
    for (const provider of result.value) {
      if (!byId.has(provider.id)) {
        byId.set(provider.id, provider);
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function getProviderStatus(
  provider: Pick<SearchIndexProviderSummary, "id" | "origin">,
  signal?: AbortSignal
): Promise<SearchIndexStatus> {
  const { base, options } = surface(provider.origin);
  const response = await requestApiJson<{ status: SearchIndexStatus }>(
    `${base}/providers/${provider.id}/status`,
    { method: "GET", signal, ...options }
  );
  return response.status;
}

export async function runProviderBackfill(
  provider: Pick<SearchIndexProviderSummary, "id" | "origin">,
  input: { force?: boolean; limit?: number } = {}
): Promise<SearchIndexBackfillResult> {
  const { base, options } = surface(provider.origin);
  const response = await requestApiJson<{ result: SearchIndexBackfillResult }>(
    `${base}/providers/${provider.id}/backfill`,
    { method: "POST", body: input, ...options }
  );
  return response.result;
}

export async function runProviderTestSearch(
  provider: Pick<SearchIndexProviderSummary, "id" | "origin">,
  input: SearchIndexTestSearchInput,
  signal?: AbortSignal
): Promise<SearchIndexTestSearchResult> {
  const { base, options } = surface(provider.origin);
  const body: Record<string, unknown> = {
    limit: input.limit ?? 25,
    query: input.query,
    strategy: input.strategy ?? "hybrid",
  };
  if (input.min_score != null) {
    body.min_score = input.min_score;
  }
  const started = performance.now();
  const response = await requestApiJson<{
    matches: SearchIndexMatch[];
    total: number;
  }>(`${base}/providers/${provider.id}/search`, {
    method: "POST",
    body,
    signal,
    ...options,
  });
  const elapsed_ms = Math.round(performance.now() - started);
  return {
    elapsed_ms,
    matches: response.matches ?? [],
    total: response.total ?? 0,
  };
}

/**
 * Rebuild a provider's whole index by looping `backfill` until a short batch
 * signals the tail (mirrors the proven KB reindex client). `force: true`
 * re-embeds every row. Bounded by `MAX_ITERATIONS` so a misbehaving provider
 * cannot spin forever.
 */
export async function rebuildProviderFully(
  provider: Pick<SearchIndexProviderSummary, "id" | "origin" | "supports">,
  options: {
    batchSize?: number;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<{ failed: number; processed: number }> {
  const batchSize = options.batchSize ?? 100;
  const MAX_ITERATIONS = 200;
  let total = 0;
  try {
    total = (await getProviderStatus(provider)).total_count;
  } catch {
    total = 0;
  }
  let done = 0;
  let failed = 0;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    options.onProgress?.(done, total);
    const result = await runProviderBackfill(provider, {
      force: true,
      limit: batchSize,
    });
    const processed = result.processed ?? 0;
    done += processed;
    failed += result.failed ?? 0;
    if (processed === 0 || processed < batchSize) {
      break;
    }
  }
  options.onProgress?.(done, total);
  return { failed, processed: done };
}

/* ── KB settings (the one source with a persisted, editable parameter set) ── */

export interface KbSearchSettings {
  chunk_max_length: number;
  chunk_overlap: number;
  chunk_strategy: string;
  embedding_model: string;
  search_vector_min_similarity: number;
  search_verifier_max_candidates: number;
  search_verifier_min_query_terms: number;
}

export type KbSearchSettingsPatch = Partial<KbSearchSettings>;

export async function getKbSearchSettings(
  signal?: AbortSignal
): Promise<KbSearchSettings> {
  return await requestApiJson<KbSearchSettings>("/api/kb/settings", {
    method: "GET",
    signal,
  });
}

export async function updateKbSearchSettings(
  patch: KbSearchSettingsPatch
): Promise<KbSearchSettings> {
  return await requestApiJson<KbSearchSettings>("/api/kb/settings", {
    method: "PUT",
    body: patch,
  });
}
