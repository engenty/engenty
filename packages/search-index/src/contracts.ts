// Core search-index contracts.
//
// `SearchDocument` is the wire shape every provider stores; `SearchIndexProvider`
// is the contract every search backend implements (chat-search, kb, contacts,
// api-catalog). Providers carry a stable `id` so the host can route auto-tools,
// declarative re-index events, and operator status/backfill by name.

export type SearchStrategy = "hybrid" | "lexical" | "semantic";

export type SearchMetadataValue =
  | boolean
  | null
  | number
  | string
  | SearchMetadataValue[]
  | { [key: string]: SearchMetadataValue };

export type SearchMetadata = Record<string, SearchMetadataValue>;

// Sentinel for tenant-less / system-scope providers (e.g. core api-catalog).
// Documents use a real tenant id when scoped per tenant; otherwise this value.
export const SEARCH_INDEX_SYSTEM_TENANT_ID = "__system__";

export interface SearchSourceOffset {
  end: number;
  start: number;
}

export interface SearchSourceLines {
  end: number;
  start: number;
}

export interface SearchChunk {
  chunk_id: string;
  chunk_index: number;
  doc_id: string;
  metadata?: SearchMetadata;
  // 1-indexed line range; only populated when chunking with `track_lines: true`.
  source_lines?: SearchSourceLines;
  // Character offsets of this chunk inside the parent document `text`.
  source_offset?: SearchSourceOffset;
  text: string;
}

export interface SearchDocument {
  chunks?: SearchChunk[];
  doc_id: string;
  metadata?: SearchMetadata;
  scope_id?: string | null;
  source_id: string;
  source_type: string;
  // Real tenant uuid, or `SEARCH_INDEX_SYSTEM_TENANT_ID` for tenant-less indexes.
  tenant_id: string;
  text: string;
}

export interface SearchPagingInput {
  limit: number;
  offset?: number;
}

export interface SearchRequest<TFilters = Record<string, never>>
  extends SearchPagingInput {
  filters?: TFilters;
  // Per-request floor. Results below this combined score are dropped post-rerank.
  min_score?: number;
  query?: string;
  strategy?: SearchStrategy;
}

export interface SearchSourceScores {
  fts?: number;
  recency?: number;
  rerank?: number;
  semantic?: number;
  trigram?: number;
  verifier?: number;
  [source: string]: number | undefined;
}

export interface SearchResult<TItem = unknown> {
  item: TItem;
  matched_fields: string[];
  score: number;
  // Carried through from the matched chunk so consumers can render snippet anchors.
  source_lines?: SearchSourceLines;
  source_offset?: SearchSourceOffset;
  source_scores: SearchSourceScores;
}

export interface SearchResponse<TItem = unknown> {
  results: SearchResult<TItem>[];
  timings?: Record<string, number>;
  total: number;
}

export interface SearchIndexStatus {
  current_count: number;
  indexed_count: number;
  last_indexed_at: string | null;
  missing_count: number;
  stale_count: number;
  total_count: number;
}

export interface ReplaceDocumentInput<TDocument extends SearchDocument> {
  document: TDocument;
  force?: boolean;
}

export interface DeleteDocumentInput {
  doc_id: string;
  tenant_id: string;
}

export interface BackfillInput {
  force?: boolean;
  limit?: number;
  tenant_id?: string | null;
  user_id?: string | null;
}

// Capability flags so the host can decide which routes / triggers to wire.
export interface SearchProviderCapabilities {
  hybrid?: boolean;
  lexical?: boolean;
  semantic?: boolean;
}

// Read-only snapshot of a managed source's effective retrieval config, surfaced
// by the admin UI so operators can see *how* a source is indexed and queried
// (thresholds, splitter, visibility) without reading code. Static values are
// reported as numbers; a value resolved per-tenant at query time (e.g. KB reads
// its similarity floor from kb_settings) is reported with `*Dynamic: true` and a
// null literal, since there is no single value to show. Hand-rolled providers
// leave this unset.
export interface SearchIndexProviderConfig {
  // Effective embedding model, or null when resolved per-tenant.
  embeddingModel?: string | null;
  embeddingModelDynamic?: boolean;
  // Lexical fast-path term ceiling; null when the source has no fast path.
  fastPathMaxTerms?: number | null;
  // Splitter mode: "none" | "fixed" | "paragraph" | "custom".
  splitter?: string;
  // Title-trigram fuzzy matching enabled (contacts quick-search).
  useTrigram?: boolean;
  // Minimum cosine for a vector-only match, or null when resolved per-tenant.
  vectorThreshold?: number | null;
  vectorThresholdDynamic?: boolean;
  // Row visibility model: "tenant" | "owner" | "user".
  visibility?: string;
}

export interface SearchIndexProvider<
  TDocument extends SearchDocument = SearchDocument,
  TFilters = Record<string, never>,
  TResult = unknown,
> {
  backfill?(input?: BackfillInput): Promise<unknown>;
  // Capabilities (auto-mode resolution and admin UI use this).
  readonly capabilities?: SearchProviderCapabilities;
  // Effective retrieval config snapshot for the admin UI (managed sources fill
  // this; hand-rolled providers may leave it unset).
  readonly config?: SearchIndexProviderConfig;
  deleteDocument(input: DeleteDocumentInput): Promise<void>;
  // Optional helper for declarative re-index when the trigger payload only carries an id.
  getDocumentById?(input: {
    doc_id: string;
    tenant_id: string;
  }): Promise<TDocument | null>;
  getStatus?(input?: {
    tenant_id?: string | null;
    user_id?: string | null;
  }): Promise<SearchIndexStatus>;
  // Stable, dotted slug (e.g. `ai_chat_search`, `contacts_search`, `kb_articles`).
  // Used by the host to route auto-tools, re-index triggers, and operator UIs.
  readonly id: string;
  replaceDocument(input: ReplaceDocumentInput<TDocument>): Promise<void>;
  search(input: SearchRequest<TFilters>): Promise<SearchResponse<TResult>>;
  // Optional semver-ish; defaults to `"1"` when unset.
  readonly version?: string;
}

export interface SearchCandidate<TItem = unknown> extends SearchResult<TItem> {
  doc_id: string;
}

export interface ReRanker<
  TCandidate extends SearchCandidate = SearchCandidate,
> {
  rerank(input: {
    candidates: TCandidate[];
    query: string;
    strategy: SearchStrategy;
  }): Promise<TCandidate[]> | TCandidate[];
}

export interface Verifier<
  TCandidate extends SearchCandidate = SearchCandidate,
> {
  verify(input: {
    candidates: TCandidate[];
    query: string;
    strategy: SearchStrategy;
  }): Promise<TCandidate[]> | TCandidate[];
}
