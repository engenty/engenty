// Retrieval service contracts (docs/wip/retrieval-service.md §4).
//
// A module registers a *source* — document builder, splitter, embedding config,
// visibility, retriever hooks — and the service manufactures a classic
// `SearchIndexProvider` from it (provider-factory.ts), so the existing registry,
// synthesized tools, admin routes, and event bindings keep working unchanged.

import type {
  SearchChunk,
  SearchDocument,
  SearchIndexStatus,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "@engenty/search-index";
import type { ZodType } from "zod";

/**
 * Structurally identical to the plugin SDK's `SearchIndexEventBinding` —
 * declared locally so `@engenty/retrieval` stays below `@engenty/plugin-sdk`
 * in the dependency graph (the SDK imports retrieval types for its typed
 * `registerRetrievalSource` surface).
 */
export interface RetrievalEventBinding<TPayload = Record<string, unknown>> {
  action: "delete" | "replace";
  docId: (payload: TPayload) => string | string[] | null | undefined;
  load?: (payload: TPayload) => Promise<unknown | null> | unknown | null;
  name: string;
  tenantScoped?: boolean;
}

/**
 * Tenant-scoped row visibility, enforced inside the fusion RPC (never in JS).
 *
 * - `tenant`: tenant + scope only.
 * - `owner`: rows with `owner_user_id` null are org-visible; otherwise owner-only
 *   (inbox / personal-connection model). Service callers (null user) see all.
 * - `user`: strictly owner-only, no org rows (chat transcripts). Service callers
 *   see all.
 */
export type VisibilityKind = "owner" | "tenant" | "user";

export interface SplitterConfigNone {
  mode: "none";
}
export interface SplitterConfigChunked {
  max_chunk_length?: number;
  mode: "fixed" | "paragraph";
  overlap?: number;
}
export interface SplitterConfigCustom {
  mode: "custom";
  split: (document: RetrievalDocument) => Promise<SearchChunk[]>;
}
export type SplitterConfig =
  | SplitterConfigChunked
  | SplitterConfigCustom
  | SplitterConfigNone;

export interface RetrievalDocument extends SearchDocument {
  /** Reserved for context-graph linking; stored, not yet queried. */
  entity_refs?: string[];
  /**
   * Flat, filter-pushdown metadata (kb_id, connection_id, …). Values are
   * strings or string arrays: jsonb containment in the fusion RPC matches
   * array values as subsets, so multi-valued facets (contact roles) filter
   * with `{ roles: ["client"] }` against a stored superset array.
   */
  filter_metadata?: Record<string, string | string[]>;
  /** Content time (email received_at, article updated_at) for time filters. */
  occurred_at?: string | null;
  /** Owner for `owner`/`user` visibility; null = org-visible. */
  owner_user_id?: string | null;
  /** Source row's updated_at at build time — drives staleness detection. */
  source_updated_at: string;
  /**
   * The space this document belongs to (PLAN-spaces.md Phase P4).
   *
   * Null means NOT SPACE-SCOPED — a contact, an inbox message — and those stay
   * visible under the existing `visibility` rules. A source whose records live
   * in a space MUST set it: search never passes through a `/s/<key>` route, so
   * no route guard protects it, and a private space's content would otherwise be
   * readable by anyone in the tenant who searches for it.
   */
  space_id?: string | null;
  title?: string | null;
}

export interface RetrievalQueryFilters {
  /** Equality/containment filters on chunk metadata; array values match when
   *  the stored array contains every listed element (jsonb `@>`). */
  metadata?: Record<string, string | string[]>;
  modules?: string[];
  occurred_after?: string | null;
  occurred_before?: string | null;
  scope_id?: string | null;
  source_types?: string[];
  /**
   * Spaces the caller may read (PLAN-spaces.md Phase P4). Injected by the host
   * from `accessibleSpaceIds`, never taken from the caller.
   *
   * `undefined`/null means UNSCOPED — documents in any space match. That is the
   * right default for module tools and admin diagnostics, which are already
   * bounded some other way, and the wrong one for anything user-facing: the
   * workspace-search route must always set it.
   */
  space_ids?: string[] | null;
  // Injected from authenticated context by the host; caller values are stripped.
  tenant_id?: string | null;
  user_id?: string | null;
}

export interface RetrievalSourceScores {
  fts: number;
  trigram: number;
  vector: number;
  [source: string]: number;
}

export interface RetrievalMatch {
  chunk_id: string;
  chunk_index: number;
  doc_id: string;
  matched_fields: string[];
  metadata: Record<string, unknown>;
  module: string;
  occurred_at: string | null;
  score: number;
  source_scores: RetrievalSourceScores;
  source_type: string;
  text: string;
  title: string | null;
}

export interface RetrievalEvaluatorContext {
  query: string;
  tenant_id: string;
  user_id: string | null;
}

/** Post-fusion, pre-hydrate filter/re-scorer (e.g. the KB LLM verifier). */
export interface RetrievalEvaluator {
  evaluate(
    matches: RetrievalMatch[],
    ctx: RetrievalEvaluatorContext
  ): Promise<RetrievalMatch[]>;
  id: string;
  shouldRun?(ctx: RetrievalEvaluatorContext): boolean | Promise<boolean>;
}

export interface RetrievalSourceRetriever<TResult = unknown> {
  evaluators?: RetrievalEvaluator[];
  /**
   * Short-query lexical fast path: at or below `maxTerms` terms the query runs
   * lexical-only — no embedding call, no evaluators. The as-you-type guarantee.
   */
  fastPath?: { maxTerms: number };
  /** Map fused chunk matches to module-shaped results (load rows, dedupe). */
  hydrate?(
    matches: RetrievalMatch[],
    ctx: RetrievalEvaluatorContext
  ): Promise<SearchResult<TResult>[]>;
  /**
   * Translate the module tool's filter shape (operation.filtersSchema) into
   * central query filters (metadata equality, time range, scope). Unmapped
   * module filters are otherwise ignored.
   */
  mapFilters?(
    filters: Record<string, unknown>
  ): Partial<
    Pick<
      RetrievalQueryFilters,
      "metadata" | "occurred_after" | "occurred_before" | "scope_id"
    >
  >;
  // `space_ids` is never mapped from module filters: the host injects it from
  // the run's space (plugin-sdk `synthesizeSearchOperation`) and the managed
  // provider forwards it verbatim.
  /** Final ordering tweaks (per-KB caps, time decay). Pure. */
  postRank?(
    results: SearchResult<TResult>[],
    ctx: RetrievalEvaluatorContext
  ): SearchResult<TResult>[];
  /** Enable title-trigram fuzzy matching (contacts quick-search). */
  useTrigram?: boolean;
  /**
   * Minimum cosine similarity for a vector-only match (default 0.62).
   * Static or per-tenant (KB reads `search_vector_min_similarity`).
   * Multi-source queries use the minimum across targeted sources.
   */
  vectorThreshold?: number | ((tenant_id: string) => Promise<number>);
}

export interface RetrievalSourceRegistration<TResult = unknown> {
  buildDocument(input: {
    doc_id: string;
    tenant_id: string;
  }): Promise<RetrievalDocument | null>;
  embedding?: {
    model?: string;
    resolveModel?(tenant_id: string): Promise<string>;
  };
  /**
   * Enumerate live source rows, newest-updated first — drives status
   * (current/stale/missing) and backfill target selection. Must exclude
   * soft-deleted rows.
   */
  listDocuments(input: {
    limit: number;
    /**
     * Equality filter on the source's own `filter_metadata` keys (e.g. KB's
     * `kb_id`). Narrows status/backfill to one container so a per-library
     * chunking change re-indexes that library alone. Optional for sources
     * without containers.
     */
    metadata?: Record<string, string>;
    tenant_id: string;
  }): Promise<{ doc_id: string; updated_at: string }[]>;
  module_id: string;
  onEvents?: RetrievalEventBinding[];
  /** Config for the synthesized per-module tool (unchanged host behavior). */
  operation: {
    entityName: string;
    filtersSchema?: ZodType;
    overrides?: Record<string, unknown>;
    // Forwarded onto the synthesized search operation. Omit = no policy
    // (not an implied tenant_shared default).
    spacePolicy?: {
      kind:
        | "account_mounted"
        | "platform"
        | "space_owned"
        | "tenant_shared"
        | "user_owned";
    };
  };
  retriever?: RetrievalSourceRetriever<TResult>;
  /** Globally unique dotted id, e.g. "kb.article", "inbox.message". */
  source_type: string;
  splitter: SplitterConfig;
  visibility: VisibilityKind;
}

export interface RetrievalBackfillInput {
  force?: boolean;
  limit?: number;
  /** Narrow the scan to documents whose `filter_metadata` matches (see `listDocuments`). */
  metadata?: Record<string, string>;
  tenant_id?: string | null;
  user_id?: string | null;
}

export interface RetrievalBackfillResult {
  failed: number;
  processed: number;
  results: { doc_id: string; error?: string; ok: boolean }[];
}

export interface RetrievalService {
  backfill(
    source_type: string,
    input: RetrievalBackfillInput
  ): Promise<RetrievalBackfillResult>;
  ingest(input: {
    doc_id: string;
    source_type: string;
    tenant_id: string;
  }): Promise<void>;
  registerSource<TResult>(
    registration: RetrievalSourceRegistration<TResult>
  ): void;
  remove(input: {
    doc_id: string;
    source_type: string;
    tenant_id: string;
  }): Promise<void>;
  /** Unified cross-source search (workspace_search). */
  search(
    request: SearchRequest<RetrievalQueryFilters>
  ): Promise<SearchResponse<RetrievalMatch>>;
  status(
    source_type: string,
    input: { tenant_id?: string | null }
  ): Promise<SearchIndexStatus>;
}

export const DEFAULT_RETRIEVAL_EMBEDDING_MODEL =
  "openai/text-embedding-3-small";
export const RETRIEVAL_VECTOR_DIM = 1536;
