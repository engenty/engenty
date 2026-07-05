# Retrieval Service — unified hybrid search across modules

- **Status:** design approved for implementation · Phase 1 in progress
- **Branch:** `feat/retrieval-service`
- **Date:** 2026-07-05
- **Prereqs read:** `packages/search-index/src/*`, the three provider implementations
  (kb / contacts / inbox), `packages/plugin-sdk/src/search-index-*`,
  `packages/context-graph`.

This document is an implementable spec: exact contracts, DDL, copy-sources, deletion
lists, and per-phase acceptance gates. Implementer is assumed to be an Opus-class
coding agent working one phase per session.

---

## 1. Goals / non-goals

**Goals**

1. One central retrieval service (storage + ingestion + query) that modules feed via
   declarative **source registrations** instead of hand-rolling provider internals.
2. **Per-content-type ingestion profiles**: splitting strategy, embedding model,
   document builder, visibility — configurable per source; a module may register
   several sources.
3. **Per-source retriever pipelines**: lexical fast-path for short queries
   (configurable term threshold), hybrid fusion, pluggable evaluators (KB's LLM
   verifier becomes the first), post-rank hooks (multi-KB limits, time decay).
4. **Unified query API** with filters (modules, source types, time range, entity
   refs) + one synthesized `workspace_search` agent tool — while keeping the
   existing per-module tools working unchanged.
5. **No legacy left behind**: every migrated module ends its phase with old tables,
   RPCs, and code deleted. Cutover, not parallel paths.

**Non-goals (explicit)**

- `core_api_catalog` (tool search) stays a custom in-memory lexical provider.
  Latency-critical, no embeddings. Revisit only after all other phases are green.
- Mastra Workspace semantic search in `apps/ai` (skills/knowledge for the `Workspace`
  class) is agent-runtime internals, not module content. Out of scope; documented here
  so "nothing left behind" stays honest.
- Cross-tenant / system providers: the central store is tenant-scoped. `isSystem`
  providers keep the custom-provider path.
- context-graph *integration* (entity linking, graph expansion) is prepared for in the
  schema (`entity_refs`) but implemented in a later, separate effort. Phase 1 stores
  the column; nothing populates or queries it yet.

**Key architectural decision:** the existing `SearchIndexProvider` interface remains
the integration surface. The service *manufactures* a provider per registered source
and registers it with the existing registry/host. Admin routes, synthesized tools,
event bindings, and the apps/ai surface keep working with zero changes. The unified
query API is additive on top.

---

## 2. Inventory: copy sources and eventual deletions

### Copy sources (proven code the service is assembled from)

| Service piece | Copy from | Adaptation |
| --- | --- | --- |
| Fusion SQL (FTS + trigram + vector, thresholds, matched_fields, source_scores) | `modules/contacts/.../search_contacts` RPC (richest) + `module_inbox.search_messages` (cleanest skeleton, on `feat/inbox-hybrid-search`) | Generalize over `search.chunks`, add filter params |
| AI-SDK embedder factory | `buildContactsEmbedder` (`modules/contacts/src/dal/contacts-search-index-provider.ts:185`) — identical in kb/inbox | Parameterize dims + batch size |
| Batched backfill runner (scan-wide / work-narrow) | inbox `backfill()` on `feat/inbox-hybrid-search` (`modules/inbox/src/dal/inbox-search-index-provider.ts`) | Table names from config |
| Status scan (current/stale/missing) | same file, `loadIndexState` + `getStatus` | Same |
| Event-driven ingestion | `bindSearchIndexProviderEvents` (`packages/plugin-sdk/src/search-index-host.ts`) | **Reused as-is, not copied** |
| Chunking | `createSearchChunks` (`packages/search-index/src/chunks.ts`) + KB's `MDocument` wrapper (`kb-articles-search-index-provider.ts:378`) | Wrap behind `SplitterConfig` |
| Evaluator (LLM verifier) | `modules/knowledge-base/src/services/kb-search-verifier.ts` (137 LOC) | Port as first `RetrievalEvaluator` |
| Strategy resolution, payload normalization, scoring helpers | `packages/search-index/src/{strategy,payload,scoring}.ts` | Reused as-is |

### Deletion lists (per phase; a phase is not done until its list is empty)

**Phase 2 (KB):**
- `modules/knowledge-base/src/dal/kb-vector-store.ts` (716 LOC, whole file)
- Embedder/chunk/backfill/status internals of
  `kb-articles-search-index-provider.ts` (file shrinks to a thin registration +
  hydrate/evaluator hooks, or disappears into `plugin.ts`)
- SQL: `module_kb.article_embeddings` table, `search_kb_embeddings` RPC,
  `kb_embedding_index_status` RPC (drop migration)
- `kb_settings` keys stay (they now feed the source profile)

**Phase 3 (inbox)** — branch `feat/inbox-hybrid-search` must be merged first:
- Provider internals of `modules/inbox/src/dal/inbox-search-index-provider.ts`
- SQL: `module_inbox.message_embeddings`, hybrid variant of `search_messages`
  (RPC reverts to serving the thread-list only, or is dropped if unused)

**Phase 4 (contacts):**
- Provider internals of `contacts-search-index-provider.ts` (~500 of 721 LOC)
- SQL: `module_contacts.contact_search_embeddings`, `search_contacts` RPC
  (trigram + role scoring move into the central RPC / retriever hooks, see §7)

**Phase 5 (chat search, apps/ai):**
- `ai.chat_search` provider internals migrate to a per-user-visibility source

---

## 3. Package layout

New package `packages/retrieval` (`@engenty/retrieval`). It depends on
`@engenty/search-index` (contracts), `@engenty/plugin-sdk` (host types),
`@supabase/supabase-js`, `ai` (embedder), and optionally `@mastra/rag`
(behind the `mastra` splitter — subpath export so non-chunking consumers don't pull it).

```
packages/retrieval/
  package.json            # exports: ".", "./mastra-splitter"
  src/
    contracts.ts          # RetrievalSourceRegistration, VisibilityDescriptor, …
    embedder-ai.ts        # createAiSdkEmbedder (hoisted, verbatim ×3 today)
    splitter.ts           # SplitterConfig → SearchChunk[] (none|fixed|paragraph|custom)
    mastra-splitter.ts    # subpath: mastraSplitter(strategy, opts) wrapper
    store.ts              # chunk/document upsert + delete against search.* (service client)
    ingest.ts             # buildDocument → split → embed → upsert pipeline
    backfill.ts           # scan-wide/work-narrow runner (copy: inbox)
    status.ts             # current/stale/missing scan (copy: inbox)
    query.ts              # unified search: fastPath → embed → fusion RPC → evaluators → hydrate → postRank
    provider-factory.ts   # manufactures a SearchIndexProvider per source (registry compat)
    service.ts            # createRetrievalService({ supabase }) — wires everything
    *.test.ts             # focused tests, see §13
  supabase/migrations/    # NO — central schema ships via apps/core migration dir
```

Central schema migration lives in `supabase/migrations/` at repo root level the same
way module migrations compose today (a `retrieval` pseudo-module dir is acceptable if
the composer requires a module; follow `scripts/supabase-sync.mjs` conventions —
check how `context_graph` ships its schema and mirror that).

Host wiring: `apps/core` constructs `createRetrievalService()` at plugin-host boot and
exposes `engenty.server.registerRetrievalSource(...)` next to
`registerSearchIndexProvider(...)` in the plugin SDK surface.

---

## 4. Contracts (`packages/retrieval/src/contracts.ts`)

```ts
import type {
  SearchChunk, SearchDocument, SearchIndexEventBinding, SearchRequest,
  SearchResult, SearchStrategy,
} from "@engenty/search-index";

/** Tenant-scoped visibility. Applied inside the fusion RPC — never in JS. */
export type VisibilityDescriptor =
  | { kind: "tenant" }                 // tenant + scope only
  | { kind: "owner" }                  // + (owner_user_id is null OR = caller)
  | { kind: "user" };                  // owner_user_id = caller, no org rows (chat)

export interface SplitterConfigNone   { mode: "none" }                    // 1 doc = 1 chunk
export interface SplitterConfigFixed  { mode: "fixed" | "paragraph";
                                        max_chunk_length?: number; overlap?: number }
export interface SplitterConfigCustom { mode: "custom";
                                        split: (doc: RetrievalDocument) => Promise<SearchChunk[]> }
export type SplitterConfig = SplitterConfigNone | SplitterConfigFixed | SplitterConfigCustom;
// Mastra strategies come in as SplitterConfigCustom via "./mastra-splitter":
//   splitter: mastraSplitter(() => resolveKbChunkSettings(tenantId))

export interface RetrievalDocument extends SearchDocument {
  title?: string | null;
  occurred_at?: string | null;         // content time (email received_at, article updated_at)
  entity_refs?: string[];              // context-graph external refs; reserved, may be empty
}

export interface RetrievalQueryFilters {
  modules?: string[];
  source_types?: string[];
  scope_id?: string | null;
  occurred_after?: string | null;
  occurred_before?: string | null;
  /** Source-specific metadata equality filters, e.g. { kb_id: "…" }. Keys are
   *  validated against the source's filtersSchema when a single source_type is
   *  targeted; ignored otherwise. */
  metadata?: Record<string, string>;
  // injected by host, never caller-supplied:
  tenant_id?: string | null;
  user_id?: string | null;
}

export interface RetrievalMatch {
  chunk_id: string; doc_id: string; source_type: string; module: string;
  title: string | null; text: string; occurred_at: string | null;
  score: number; source_scores: Record<string, number>;
  matched_fields: string[]; metadata: Record<string, unknown>;
}

export interface RetrievalEvaluatorContext {
  query: string; tenant_id: string; user_id: string | null;
}
export interface RetrievalEvaluator {
  id: string;
  /** May drop, keep, or re-score matches. Runs after fusion, before hydrate. */
  evaluate(matches: RetrievalMatch[], ctx: RetrievalEvaluatorContext): Promise<RetrievalMatch[]>;
  /** Skip condition, e.g. min query terms (KB verifier). */
  shouldRun?(ctx: RetrievalEvaluatorContext): boolean | Promise<boolean>;
}

export interface RetrievalSourceRegistration<TResult = unknown> {
  source_type: string;                  // "kb.article" — globally unique, dotted
  module_id: string;
  /** Rebuild the canonical document. null = delete from index. */
  buildDocument(input: { doc_id: string; tenant_id: string }): Promise<RetrievalDocument | null>;
  splitter: SplitterConfig;
  embedding?: {
    model?: string;                     // default "openai/text-embedding-3-small"
    resolveModel?(tenant_id: string): Promise<string>;   // per-tenant (KB)
  };
  visibility: VisibilityDescriptor;
  onEvents?: SearchIndexEventBinding[];
  retriever?: {
    /** Short-query lexical fast path: skip embedding + evaluators entirely. */
    fastPath?: { maxTerms: number };
    evaluators?: RetrievalEvaluator[];
    /** Map matches to module-shaped results (load rows, dedupe chunks→doc, …). */
    hydrate?(matches: RetrievalMatch[], ctx: RetrievalEvaluatorContext): Promise<SearchResult<TResult>[]>;
    /** Final ordering tweaks (per-KB caps, time decay). Pure function. */
    postRank?<T>(results: SearchResult<T>[], ctx: RetrievalEvaluatorContext): SearchResult<T>[];
  };
  /** Kept so the synthesized per-module tool is unchanged. */
  operation: {
    entityName: string;
    overrides?: Record<string, unknown>;   // same shape as today's operationOverrides
    filtersSchema?: unknown;               // ZodType, merged into tool input
  };
}
```

`createRetrievalService({ supabase })` returns:

```ts
interface RetrievalService {
  registerSource(reg: RetrievalSourceRegistration): void;   // manufactures + registers provider
  search(req: SearchRequest<RetrievalQueryFilters>): Promise<SearchResponse<RetrievalMatch>>; // unified
  // per-source pass-throughs used by the manufactured providers:
  ingest(source_type: string, doc_id: string, tenant_id: string): Promise<void>;
  remove(source_type: string, doc_id: string, tenant_id: string): Promise<void>;
  backfill(source_type: string, input: BackfillInput): Promise<BackfillResult>;
  status(source_type: string, tenant_id: string): Promise<SearchIndexStatus>;
}
```

---

## 5. Central schema (DDL — new migration, additive)

```sql
create schema if not exists search;
create extension if not exists vector;
create extension if not exists pg_trgm;

-- Doc-level bookkeeping: status tracking + delete cascades.
create table search.documents (
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  source_type text not null,
  doc_id text not null,
  module text not null,
  scope_id text not null default 'default',
  owner_user_id uuid,                       -- null = org-visible (per descriptor)
  title text,
  metadata jsonb not null default '{}',
  entity_refs text[] not null default '{}', -- reserved for context-graph linking
  occurred_at timestamptz,
  content_updated_at timestamptz not null,  -- source row's updated_at at index time
  indexed_at timestamptz not null default now(),
  embedding_model text,
  primary key (tenant_id, source_type, doc_id)
);
create index on search.documents (tenant_id, module, source_type);

create table search.chunks (
  id text primary key,                      -- createSearchChunkId(doc) format
  tenant_id uuid not null references core.tenants(id) on delete cascade,
  source_type text not null,
  doc_id text not null,
  chunk_index int not null,
  module text not null,                     -- denormalized for one-pass filtering
  scope_id text not null default 'default',
  owner_user_id uuid,
  occurred_at timestamptz,
  metadata jsonb not null default '{}',     -- flat, filterable (kb_id, connection_id…)
  text text not null,
  fts tsvector generated always as (to_tsvector('simple', text)) stored,
  embedding vector(1536),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, source_type, doc_id)
    references search.documents (tenant_id, source_type, doc_id) on delete cascade
);
create index on search.chunks using gin (fts);
create index on search.chunks using hnsw (embedding vector_cosine_ops);
create index on search.chunks using gin (metadata jsonb_path_ops);
create index on search.chunks (tenant_id, source_type, occurred_at desc);

grant usage on schema search to service_role;
grant select, insert, update, delete on all tables in schema search to service_role;
alter table search.documents enable row level security;
alter table search.chunks enable row level security;
-- Service-role only. No authenticated policies: all reads flow through the RPC /
-- gateway, which injects auth-derived tenant/user. Mirrors how module providers
-- already query via service client with injected filters.
```

Notes:
- **Titles are chunk 0 text prefix by convention** — the fusion RPC also matches the
  document title (join to `search.documents`, weight A) so subject/display-name
  behavior from contacts/inbox survives. Documents carry the title; chunks carry body.
- 1536 dims fixed (all current models). If a tenant switches models, backfill
  re-embeds; `embedding_model` on documents makes stale-by-model detectable.
- `metadata` is intentionally **flat string-valued** for filter pushdown
  (`metadata @> '{"kb_id":"…"}'`). Rich metadata belongs to hydrate.

## 6. Fusion RPC

`search.query_chunks(...)` — plpgsql, `stable`, service_role only. Signature:

```sql
p_tenant_id uuid, p_user_id uuid,          -- p_user_id null = service caller (sees all)
p_scope_id text, p_query text,
p_query_embedding text,                     -- json array | null (lexical-only)
p_modules text[] default null,
p_source_types text[] default null,
p_metadata jsonb default null,              -- containment filter on chunks.metadata
p_occurred_after timestamptz default null, p_occurred_before timestamptz default null,
p_visibility text[] default null,           -- per included source_type: 'tenant'|'owner'|'user'
p_limit int, p_offset int,
p_vector_threshold float8 default 0.62, p_trigram_threshold float8 default 0.30,
p_use_trigram boolean default false
```

Scoring (copy the shapes from `search_contacts` / `search_messages`):

```
fts_score     = ts_rank_cd(chunk.fts + title-vector(A), websearch_to_tsquery('simple', q))
title_trgm    = greatest(similarity(title, q), word_similarity(q, title))   -- only if p_use_trigram
vector_score  = 1 - (embedding <=> qemb)
score         = fts_score * 2.0 + title_trgm + vector_score
keep if        fts_score > 0 OR title_trgm >= trgm_thresh OR vector_score >= vec_thresh
              (or query empty)
```

Visibility is applied **per row** from the denormalized columns:
`owner` sources ⇒ `owner_user_id is null or p_user_id is null or owner_user_id = p_user_id`;
`user` sources ⇒ `owner_user_id = p_user_id` (service caller exempt);
`tenant` ⇒ tenant+scope only. The RPC receives the per-source kind via a
`search.source_visibility` lookup table maintained at registration time (simpler and
faster than passing maps per call; INSERT ON CONFLICT at boot).

Returns jsonb `{ total, matches: [{chunk_id, doc_id, source_type, module, title, text,
occurred_at, metadata, score, matched_fields, source_scores:{fts,trigram,vector}}] }`
ordered by score desc, occurred_at desc nulls last, chunk_id.

## 7. Retriever pipeline (query path)

```
query.ts:
  1. resolve targeted sources (explicit source_types filter, or the single source
     when called through a manufactured provider, or ALL sources for workspace_search)
  2. fastPath check: term count ≤ min(fastPath.maxTerms of targeted sources)
       → lexical only: no embedding call, no evaluators               [KB: as-you-type]
  3. strategy !== 'lexical' → embed query once (shared embedder cache per model)
       embed failure → warn + degrade to lexical (copy: inbox provider)
  4. fusion RPC (one call, filters pushed down)
  5. per-source evaluators (only when a single source is targeted, or evaluator
     declares itself multi-source-safe): KB verifier drops/keeps matches
  6. hydrate (per source): map chunks → module results; default hydrate returns
     RetrievalMatch as-is (workspace_search)
  7. postRank: per-KB caps, time decay, etc.
```

Contacts' trigram/role specifics land as: `p_use_trigram=true` for the contacts
source + a `role` metadata filter + a postRank boost — validated in Phase 4, and the
golden test for it is "quick-search for a misspelled name still finds the contact".

## 8. Ingestion pipeline

`ingest.ts`: `buildDocument → (null? delete) → splitter → resolve model → embedTexts
(batched, maxBatchSize 64) → tx-ish upsert`: upsert document row, delete chunks with
`chunk_index >= new count`, upsert chunks. Deletes cascade from documents.
Event path: manufactured provider's `replaceDocument`/`deleteDocument` call
`ingest`/`remove`; `bindSearchIndexProviderEvents` keeps driving them — **zero host
changes**. Backfill: copy inbox's batched runner, keyed on
`documents.content_updated_at < source.updated_at OR missing`.

## 9. Unified API surface

- `workspace_search` synthesized operation (module `core`, entity `workspace`):
  input `{ query, limit, offset, strategy?, filters: RetrievalQueryFilters }`,
  auth-injected tenant/user like every synthesized op. Returns `RetrievalMatch[]`
  with deep-link info (module + source_type + doc_id; UI resolves links).
- `/api/search-index/*` admin routes: unchanged (providers are manufactured).
- apps/ai surface: unchanged.

## 10. Dev DB strategy

- Phase 1 is additive (new schema) → shared dev stack, normal `db:migrate`.
- Phase 2+ cutovers drop module tables → **`pnpm db:snapshot` immediately before
  applying each cutover migration** (restore path: `pnpm db:restore`). No second
  local Supabase stack (port collision); snapshot/restore is the isolation tool.
- Never `supabase stop --no-backup` (standing rule).

---

## 11. Phase plan

### Phase 1 — retrieval core (this branch)
Build `packages/retrieval` per §3–§9 + central schema migration + `apps/core` boot
wiring + `registerRetrievalSource` on the plugin SDK surface + `workspace_search` op.
**Nothing migrates yet**; prove the machinery with tests + one demo source (test-only).

Acceptance gate:
- unit tests green (§13) — ✅ 24/24 (2026-07-05)
- E2E test green (§13) against local Supabase — ✅ 8/8 (2026-07-05). The suite
  caught a real bug on first run: `chunks.id` was a global PK but chunk ids are
  doc-scoped, so a second tenant's backfill overwrote the first tenant's chunks;
  PK is now `(tenant_id, id)`.
- boot with zero registered sources is a no-op — ✅ service is created lazily on
  the first `registerRetrievalSource` call
- `workspace_search` live curl smoke: DEFERRED to the first act of Phase 2 — the
  tool only synthesizes once a source registers, and no module does yet. (Wiring
  is in place: loader registers `core_workspace_search` when the service spins up.)

Dev-DB notes from execution: the shared stack needed the `search` schema exposed —
`supabase-sync` composes it from the migration, but the `authenticator` role's
`pgrst.db_schemas` setting SHADOWS the container env (known gotcha) and must be
updated + `notify pgrst, 'reload config'` / `'reload schema'`. Migration filenames
must match `YYYYMMDDHHMMSS_plugin_<slug>.sql` or the aggregator rejects them.

### Phase 2 — KB migration (the complexity proof)
1. **Before any code:** golden-query harness (§13) — record current results.
2. Register `kb.article` source: `mastraSplitter` reading `kb_settings`
   (chunk_strategy/max_length/overlap), `resolveModel` from settings,
   `fastPath.maxTerms` from a NEW `kb_settings.search_fast_path_max_terms`
   (default 2 — the "BM25 as you type" knob), verifier evaluator
   (port `kb-search-verifier.ts`; `shouldRun` = existing min-terms logic),
   hydrate = article load + chunk→article grouping (copy from `searchOneKb`),
   postRank = per-KB caps for multi-KB queries (`kb_id` metadata filter absent ⇒
   all KBs; cap `max(3, ceil(limit/kbCount))`).
3. Data migration: `INSERT INTO search.documents/chunks SELECT … FROM
   module_kb.article_embeddings JOIN articles` (same dims — no re-embedding).
4. Cutover migration: drop `article_embeddings`, `search_kb_embeddings`,
   `kb_embedding_index_status`. Delete `kb-vector-store.ts` + provider internals.
5. GraphRAG (`kb-graph-rag.ts`) reads context-graph, not the vector store — verify
   its imports, adjust only if it touched deleted symbols.

Acceptance gate: golden queries ≥ parity (see §13 protocol); as-you-type latency
(lexical fast path) p50 < 80ms locally; KB UI search + agent tool verified in dev
stack; deletion list empty; `pnpm db:snapshot` taken before cutover.

**Phase 2 status: DONE 2026-07-05.** Golden 18/18 at parity (3 reviewed
improvements recorded via `accept_new_top1`); fast-path p50 ≈ 13ms; tool +
workspace_search verified live; deletion list empty (kb-vector-store.ts,
provider internals, article_embeddings + both RPCs dropped); manual pg_dump
snapshot at `.engenty/pre-kb-cutover-20260705.dump` (db:snapshot CLI expects a
per-worktree container name — shared stack needs docker exec pg_dump).
Execution findings folded back into the design:
- Pre-existing legacy bug found by the harness: injected `user_id` emptied
  every authenticated KB search (fixed in b8132b4 before recording baseline).
- `vectorThreshold` became a per-source retriever knob (static or per-tenant):
  the 0.62 default silently dropped KB's 0.45-calibrated matches.
- Verifier semantics: trims the tail, never vetoes the top fused hit, and a
  fully-rejected set falls back to the fused ranking — judging lone table
  fragments under-informs the model.
- `registerSource` replaces on re-registration and the workspace_search
  receipt re-homes per call: dev plugin reload re-runs factories and disposes
  the previous owner's receipts.

### Phase 3 — inbox (prereq: `feat/inbox-hybrid-search` merged)
Source: splitter `none` (doc builder already caps body), visibility `owner`,
`occurred_at = received_at`, metadata `{connection_id, status}`, events
synced/deleted. Data migration + drop `message_embeddings` + hybrid RPC parts.
Gate: existing inbox provider tests port to source-level tests; hybrid smoke on dev
mail (semantic question returns fts=0/vector≥thresh match).

### Phase 4 — contacts
Source: splitter `none` (doc = `buildContactSearchDocument`), `p_use_trigram`,
role/type via metadata filters + postRank role boost. Gate: quick-search UX parity
(misspelled-name golden cases), deletion list empty.

### Phase 5 — chat search + repo sweep
`ai.chat_search` → source with `visibility: "user"`. Then: repo-wide grep sweep for
deleted symbols, docs update (`docs/wip/*`, module AGENTS notes), final E2E rerun.

### Explicitly deferred
Tool search (`core_api_catalog`) — separate discussion with latency data on the table.

---

## 12. What Phase 1 does NOT build (scope fences)

- No re-ranking model / no cross-encoder — evaluator slot exists, KB verifier is the
  only implementation.
- No RRF — weighted-sum fusion copied from proven RPCs. Revisit only with eval data.
- No entity_refs population, no graph expansion.
- No UI. `workspace_search` is API/tool-only until a product decision on global search.
- No per-tenant embedding-model switching UI beyond what KB settings already have.

## 13. Testing (focused — no inflation)

**Unit (packages/retrieval, vitest, mocked supabase + mocked `ai`):**
1. `splitter.test.ts` — none/fixed/paragraph produce expected chunk ids/offsets
   (reuses `createSearchChunks` fixtures); custom splitter passthrough.
2. `ingest.test.ts` — null document ⇒ delete; chunk-count shrink deletes tail;
   embed batching (1 call for ≤64 chunks); model resolution order
   (resolveModel > model > default).
3. `backfill.test.ts` — scan-wide/work-narrow: older-than-window missing doc IS
   picked up; force re-embeds; per-doc errors don't abort the batch.
4. `query.test.ts` — fastPath: 2-term query never calls embedder; 3-term does;
   embed failure degrades to lexical; evaluator drop is respected; single fusion
   RPC call with correctly mapped filter params.
5. `provider-factory.test.ts` — manufactured provider satisfies the existing
   registry contract (search/replace/delete/getStatus/backfill delegate correctly).

**SQL/E2E (vitest, `test:e2e`, requires local Supabase — service-role client, real
schema, deterministic fake vectors, no AI API):**
6. `e2e/retrieval.e2e.test.ts` —
   - apply migration state, register two test sources (visibility `tenant` + `owner`)
   - ingest 6 docs with hand-built embeddings (unit vectors along axes ⇒ exact
     cosine expectations)
   - lexical query matches FTS as expected; semantic query ranks the axis-aligned
     doc first; hybrid fuses (score = 2·fts + vec verified numerically for one case)
   - owner-visibility: user A never sees user B's owner-scoped chunks; service
     caller (null user) sees all; tenant isolation across two tenants
   - time + source_type + metadata filters
   - delete doc ⇒ chunks gone (cascade)
   Cleanup: delete by test tenant ids (fixed UUIDs), no `db reset`.

**Phase 2 golden queries (`modules/knowledge-base/test/golden-queries.json` + runner):**
20–30 real queries → expected article ids (top-3 containment). Runner executes
against current KB search (recorded before migration) and against the new path;
gate = no regression on containment, report score deltas. Verifier cases included
(≥3-term queries) and fast-path cases (1–2 terms must return in lexical mode).

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| KB quality regression | Golden queries recorded BEFORE migration; verifier ported unchanged; weights copied not invented |
| Visibility bug leaks personal rows | Owner columns denormalized to chunks; E2E test 6 covers it; RPC is the only read path |
| `search` schema not exposed via PostREST | Not needed — service client + RPC only. E2E catches accidental dependence |
| Migration composer needs a module dir | Mirror context-graph's shipping pattern (checked in Phase 1) |
| Model switch leaves mixed-dim vectors | dims fixed 1536 for all supported models; `embedding_model` recorded per doc for staleness |
| Two sessions editing shared dev DB | Snapshot before every destructive cutover; additive Phase 1 |
