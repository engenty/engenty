// Retriever pipeline (docs/wip/retrieval-service.md §7):
//   targeted sources → fastPath check → query embedding → fusion RPC →
//   evaluators → hydrate → postRank.
//
// Model honesty: the fusion RPC scores vectors only for chunks whose
// `embedding_model` matches the query embedding's model. A multi-source query
// across sources with different per-tenant models degrades the mismatched
// sources to lexical for that query instead of comparing incomparable vectors.

import {
  embedTexts,
  type SearchEmbedder,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
  type SearchStrategy,
} from "@engenty/search-index";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RetrievalEvaluatorContext,
  RetrievalMatch,
  RetrievalQueryFilters,
  RetrievalSourceRegistration,
  RetrievalSourceScores,
} from "./contracts.js";
import type { RetrievalDbSource } from "./store.js";

const SCHEMA = "search";
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const DEFAULT_VECTOR_THRESHOLD = 0.62;
const DEFAULT_TRIGRAM_THRESHOLD = 0.3;

const logger = createLogger({ name: "retrieval-query" });

export interface QueryDeps {
  resolveEmbedderForSources(
    sources: RetrievalSourceRegistration[],
    tenantId: string
  ): Promise<SearchEmbedder>;
  sources: Map<string, RetrievalSourceRegistration>;
  /** Plain client (tests) or the Phase A handle pair — the RPC resolves the
   * tenant-locked handle from the request's own tenant_id. */
  supabase: RetrievalDbSource;
}

function countQueryTerms(query: string): number {
  return query.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
}

function readSourceScores(raw: unknown): RetrievalSourceScores {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    fts: Number(obj.fts ?? 0),
    trigram: Number(obj.trigram ?? 0),
    vector: Number(obj.vector ?? 0),
  };
}

interface RawRpcMatch {
  chunk_id: string;
  chunk_index?: unknown;
  doc_id: string;
  matched_fields?: unknown;
  metadata?: unknown;
  module: string;
  occurred_at?: unknown;
  score?: unknown;
  source_scores?: unknown;
  source_type: string;
  text?: unknown;
  title?: unknown;
}

function toMatch(raw: RawRpcMatch): RetrievalMatch {
  return {
    chunk_id: String(raw.chunk_id),
    chunk_index: Number(raw.chunk_index ?? 0),
    doc_id: String(raw.doc_id),
    matched_fields: Array.isArray(raw.matched_fields)
      ? raw.matched_fields.filter(
          (field): field is string => typeof field === "string"
        )
      : [],
    metadata:
      raw.metadata && typeof raw.metadata === "object"
        ? (raw.metadata as Record<string, unknown>)
        : {},
    module: String(raw.module),
    occurred_at: raw.occurred_at ? String(raw.occurred_at) : null,
    score: Number(raw.score ?? 0),
    source_scores: readSourceScores(raw.source_scores),
    source_type: String(raw.source_type),
    text: String(raw.text ?? ""),
    title: raw.title == null ? null : String(raw.title),
  };
}

/** Resolve which sources a request targets (single-source for module tools). */
export function resolveTargetSources(
  deps: QueryDeps,
  filters: RetrievalQueryFilters
): RetrievalSourceRegistration[] {
  const requested = filters.source_types?.filter(Boolean);
  if (requested?.length) {
    return requested
      .map((sourceType) => deps.sources.get(sourceType))
      .filter((source): source is RetrievalSourceRegistration =>
        Boolean(source)
      );
  }
  let all = Array.from(deps.sources.values());
  if (filters.modules?.length) {
    const modules = new Set(filters.modules);
    all = all.filter((source) => modules.has(source.module_id));
  }
  return all;
}

/** Lexical fast path applies when every targeted source opts in and the query
 *  is at or under the smallest threshold. Single-source module tools get their
 *  exact configured behavior. */
export function isFastPathQuery(
  sources: RetrievalSourceRegistration[],
  query: string
): boolean {
  if (sources.length === 0 || !query) {
    return false;
  }
  const thresholds = sources.map(
    (source) => source.retriever?.fastPath?.maxTerms ?? 0
  );
  if (thresholds.some((threshold) => threshold <= 0)) {
    return false;
  }
  return countQueryTerms(query) <= Math.min(...thresholds);
}

export async function runQuery(
  deps: QueryDeps,
  request: SearchRequest<RetrievalQueryFilters>
): Promise<SearchResponse<RetrievalMatch>> {
  const filters = request.filters ?? {};
  const tenantId = filters.tenant_id?.trim();
  if (!tenantId) {
    return { results: [], total: 0 };
  }
  const sources = resolveTargetSources(deps, filters);
  if (sources.length === 0) {
    return { results: [], total: 0 };
  }
  const query = (request.query ?? "").trim();
  const limit = clampLimit(request.limit);
  const offset = Math.max(request.offset ?? 0, 0);
  const fastPath = isFastPathQuery(sources, query);
  const strategy: SearchStrategy = fastPath
    ? "lexical"
    : (request.strategy ?? "hybrid");

  let queryEmbedding: number[] | null = null;
  let embeddingModel: string | null = null;
  if (query && strategy !== "lexical") {
    try {
      const embedder = await deps.resolveEmbedderForSources(sources, tenantId);
      const [vector] = await embedTexts(embedder, [query]);
      queryEmbedding = vector ?? null;
      embeddingModel = embedder.modelId;
    } catch (err) {
      logger.warn("retrieval query embedding failed; falling back to lexical", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const useTrigram = sources.some((source) => source.retriever?.useTrigram);
  let vectorThreshold = DEFAULT_VECTOR_THRESHOLD;
  for (const source of sources) {
    const configured = source.retriever?.vectorThreshold;
    if (configured === undefined) {
      continue;
    }
    const resolved =
      typeof configured === "function"
        ? await configured(tenantId)
        : configured;
    if (Number.isFinite(resolved)) {
      vectorThreshold = Math.min(vectorThreshold, resolved);
    }
  }
  // Tenant-locked when the deps carry the handle pair: query_chunks is
  // SECURITY INVOKER, so under engenty_server the RPC's own reads run inside
  // RLS and the p_tenant_id parameter can only narrow, never widen.
  const queryDb: SupabaseClient =
    typeof (deps.supabase as { getDb?: unknown }).getDb === "function"
      ? (
          deps.supabase as {
            getDb: (auth: { tenantId: string }) => SupabaseClient;
          }
        ).getDb({ tenantId })
      : (deps.supabase as SupabaseClient);
  const { data, error } = await queryDb.schema(SCHEMA).rpc("query_chunks", {
    p_embedding_model: embeddingModel,
    p_limit: limit,
    p_metadata: filters.metadata ?? null,
    p_modules: filters.modules?.length ? filters.modules : null,
    p_occurred_after: filters.occurred_after ?? null,
    p_occurred_before: filters.occurred_before ?? null,
    p_offset: offset,
    p_query: query,
    p_query_embedding: queryEmbedding ? JSON.stringify(queryEmbedding) : null,
    p_scope_id: filters.scope_id?.trim() || "default",
    p_source_types: sources.map((source) => source.source_type),
    p_tenant_id: tenantId,
    p_trigram_threshold: DEFAULT_TRIGRAM_THRESHOLD,
    p_use_trigram: useTrigram,
    p_user_id: filters.user_id ?? null,
    p_vector_threshold: vectorThreshold,
  });
  if (error) {
    throw new Error(`retrieval query failed: ${error.message}`);
  }
  const payload = (data ?? {}) as { matches?: RawRpcMatch[]; total?: number };
  let matches = (payload.matches ?? []).map(toMatch);
  const total = Number(payload.total ?? matches.length);

  const ctx: RetrievalEvaluatorContext = {
    query,
    tenant_id: tenantId,
    user_id: filters.user_id ?? null,
  };

  // Evaluators + hydrate + postRank run only for single-source requests —
  // module tools. workspace_search returns raw fused matches.
  if (sources.length === 1) {
    const source = sources[0];
    if (!fastPath) {
      for (const evaluator of source?.retriever?.evaluators ?? []) {
        const shouldRun = evaluator.shouldRun
          ? await evaluator.shouldRun(ctx)
          : true;
        if (shouldRun) {
          matches = await evaluator.evaluate(matches, ctx);
        }
      }
    }
    if (source?.retriever?.hydrate) {
      let results = await source.retriever.hydrate(matches, ctx);
      if (source.retriever.postRank) {
        results = source.retriever.postRank(results, ctx);
      }
      return {
        results: results as SearchResult<RetrievalMatch>[],
        total: Math.min(total, Number.MAX_SAFE_INTEGER),
      };
    }
  }

  return {
    results: matches.map((match) => ({
      item: match,
      matched_fields: match.matched_fields,
      score: match.score,
      source_scores: { ...match.source_scores },
    })),
    total,
  };
}
