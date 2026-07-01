// `kb.article` SearchIndexProvider.
//
// Single source of truth for KB article search end-to-end:
//
//   - `search()` runs vector kNN against `module_kb.search_kb_embeddings`,
//     optionally fans out per-KB when no `kb_id` is set (so the synthesized
//     auto-tool can honor the AGENTS rule "omit kb_id → search every
//     accessible KB"), then merges FTS / ilike fallback hits via
//     `ArticleRepo.suggestFts`. Honors **explicit `strategy: "lexical"`** by
//     skipping the embedder entirely (BM25 / FTS / trigram only) — important
//     for the hub typing-suggest hot path that should not pay for vectors
//     just because vectors are available.
//
//   - `replaceDocument()` chunks the article markdown via the shared
//     `createSearchChunks({ mode: "paragraph" })` helper, embeds each chunk
//     in batches, and replaces the row set in `module_kb.article_embeddings`.
//     Empty / missing text deletes the row set.
//
//   - `getDocumentById()` rebuilds the canonical `SearchDocument` (article
//     fields + chunked text) so the SDK declarative re-index binding can
//     `replace` from `kb.article.{created|updated}` events without the
//     emitting site having to embed inline.
//
//   - `getStatus()` / `backfill()` wrap the existing
//     `kb_embedding_index_status` RPC and a paged article scan so the
//     `/api/search-index/providers/kb.article/{status,backfill}` admin
//     surface (Phase A) just works.
//
// Tenant id flows through `request.filters.tenant_id` (the synthesized op +
// admin route both inject this from authenticated context). Scope id is
// optional and falls back to `"default"`.

import {
  compactSearchText,
  defineEmbedder,
  embedTexts,
  type SearchChunk,
  type SearchDocument,
  type SearchIndexProvider,
  type SearchIndexStatus,
  type SearchProviderCapabilities,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
  type SearchStrategy,
} from "@engenty/search-index";
import { createLogger } from "@engenty/telemetry";
import { MDocument } from "@mastra/rag";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embed, embedMany } from "ai";
import { z } from "zod";
import { kbArticlePath } from "../../ui/kb-paths.js";
import type { KbSearchResult, KnowledgeBase } from "../schema/types.js";
import type { ArticleRepo, KbRepo, KbSettingsRepo } from "./contracts.js";
import { EngentyKbVectorStore } from "./kb-vector-store.js";
import { DEFAULT_KB_SETTINGS, SCHEMA } from "./shared.js";

// Local parse for the `kb_embedding_index_status` RPC payload; used only by
// the admin status surface to project into the generic `SearchIndexStatus`
// shape. Not part of the module public API.
const kbEmbeddingIndexStatusSchema = z.object({
  total_articles: z.coerce.number(),
  indexed_articles: z.coerce.number(),
  missing_count: z.coerce.number(),
  stale_count: z.coerce.number(),
  last_embedded_at: z.string().nullable(),
});
type KbEmbeddingIndexStatusRow = z.infer<typeof kbEmbeddingIndexStatusSchema>;

const ARTICLES_TABLE = "articles";
const EMBEDDINGS_TABLE = "article_embeddings";
const KB_VECTOR_DIM = 1536;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DEFAULT_BACKFILL_LIMIT = 100;
const MAX_BACKFILL_LIMIT = 500;
const EMBED_BATCH_SIZE = 20;
const MAX_CHUNK_LENGTH = 1000;
const CHUNK_OVERLAP = 100;

const logger = createLogger({ name: "kb-search-index" });

// `kb.article` provider filters. `kb_id` is optional — when omitted, the
// provider fans out across every accessible tenant KB.
export interface KbArticlesSearchFilters {
  fts_fallback?: boolean;
  kb_id?: string;
  match_threshold?: number | null;
  max_vector_distance?: number | null;
  scope_id?: string | null;
  tenant_id?: string | null;
  use_vector?: boolean;
  // Opt-in LLM verifier; only runs for long vector queries when configured.
  verifier?: boolean;
}

export interface KbArticleSearchMatch extends KbSearchResult {
  end_line?: number;
  // Stamped on every hit so multi-KB callers can render the source KB.
  kb_id: string;
  kb_name: string;
  start_line?: number;
}

export type KbArticlesSearchProvider = SearchIndexProvider<
  SearchDocument,
  KbArticlesSearchFilters,
  KbArticleSearchMatch
>;

export interface CreateKbArticlesSearchIndexProviderOptions {
  // The provider needs lightweight access to a per-tenant repo factory so it
  // can list KBs (multi-KB fan-out), look up article fields for the verifier,
  // and read kb_settings (verifier knobs / vector min similarity / embedding
  // model). The plugin wires this with a 1-line factory.
  resolveRepos: (
    tenantId: string,
    scopeId: string
  ) => {
    articles: ArticleRepo;
    kb: KbRepo;
    settings: KbSettingsRepo;
  };
  supabase: SupabaseClient;
}

const CAPABILITIES: SearchProviderCapabilities = {
  hybrid: true,
  lexical: true,
  semantic: true,
};

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function buildKbEmbedder(modelId: string) {
  const lower = modelId.toLowerCase();
  const providerOptions: Record<string, Record<string, unknown>> | undefined =
    lower.startsWith("google/")
      ? { google: { outputDimensionality: KB_VECTOR_DIM } }
      : lower === "openai/text-embedding-3-large"
        ? { openai: { dimensions: KB_VECTOR_DIM } }
        : undefined;
  return defineEmbedder(
    async (texts) => {
      if (texts.length === 1) {
        const single = await embed({
          model: modelId,
          value: texts[0] ?? "",
          ...(providerOptions
            ? { providerOptions: providerOptions as never }
            : {}),
        });
        return [Array.from(single.embedding as readonly number[]) as number[]];
      }
      const result = await embedMany({
        maxParallelCalls: 4,
        model: modelId,
        values: texts,
        ...(providerOptions
          ? { providerOptions: providerOptions as never }
          : {}),
      });
      return result.embeddings.map(
        (raw) => Array.from(raw as readonly number[]) as number[]
      );
    },
    {
      batch: true,
      dimensions: KB_VECTOR_DIM,
      maxBatchSize: EMBED_BATCH_SIZE,
      modelId,
    }
  );
}

export function createKbArticlesSearchIndexProvider(
  options: CreateKbArticlesSearchIndexProviderOptions
): KbArticlesSearchProvider {
  const { resolveRepos, supabase } = options;

  const vectorStore = new EngentyKbVectorStore({
    id: "kb.article.store",
    supabase,
    resolveRepos,
  });

  const embeddingsTable = () => supabase.schema(SCHEMA).from(EMBEDDINGS_TABLE);
  const articlesTable = () => supabase.schema(SCHEMA).from(ARTICLES_TABLE);

  async function resolveModelId(settings: KbSettingsRepo): Promise<string> {
    const s = await settings.get();
    return s.embedding_model?.trim() || DEFAULT_KB_SETTINGS.embedding_model;
  }

  // Run hybrid search inside a single KB, delegating all filtering, lexical FTS, and verifier logic to the vector store query.
  async function searchOneKb(input: {
    filters: KbArticlesSearchFilters;
    kb: KnowledgeBase;
    limit: number;
    query: string;
    repos: ReturnType<
      CreateKbArticlesSearchIndexProviderOptions["resolveRepos"]
    >;
    scopeId: string;
    strategy: SearchStrategy;
    tenantId: string;
  }): Promise<KbArticleSearchMatch[]> {
    const { filters, kb, limit, query, repos, scopeId, strategy, tenantId } =
      input;

    const settings = await repos.settings.get();
    const modelId = await resolveModelId(repos.settings);
    const embedder = buildKbEmbedder(modelId);
    let queryEmbedding: number[] | null = null;

    if (strategy !== "lexical" && filters.use_vector !== false) {
      try {
        const [vec] = await embedTexts(embedder, [query]);
        queryEmbedding = vec ?? null;
      } catch (err) {
        logger.warn("KB query embedding failed; falling back to lexical only", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const queryResults = await vectorStore.query({
      indexName: kb.id,
      queryVector: queryEmbedding ?? undefined,
      topK: limit,
      filter: {
        ...filters,
        tenant_id: tenantId,
        scope_id: scopeId,
        kb_id: kb.id,
        query,
        strategy,
      },
    });

    const finalResults = queryResults.map((qr) => ({
      article_id: qr.id,
      chunk_text: qr.metadata?.text ?? "",
      kb_id: kb.id,
      kb_name: kb.name,
      kb_slug: kb.slug,
      score: qr.score,
      title: qr.metadata?.title ?? "",
      slug: qr.metadata?.slug,
      url: qr.metadata?.slug
        ? kbArticlePath(kb.slug, qr.metadata.slug)
        : undefined,
      start_line: qr.metadata?.start_line,
      end_line: qr.metadata?.end_line,
    }));
    (finalResults as any).__timings = (queryResults as any).__timings;
    return finalResults;
  }

  function perKbLimit(totalLimit: number, kbCount: number): number {
    if (kbCount <= 1) {
      return totalLimit;
    }
    return Math.max(3, Math.ceil(totalLimit / kbCount));
  }

  async function search(
    request: SearchRequest<KbArticlesSearchFilters>
  ): Promise<SearchResponse<KbArticleSearchMatch>> {
    const filters = request.filters ?? {};
    const tenantId = filters.tenant_id?.trim() ?? null;
    if (!tenantId) {
      return { results: [], total: 0 };
    }
    const scopeId = filters.scope_id?.trim() || "default";
    const limit = clampLimit(request.limit);
    const query = (request.query ?? "").trim();
    if (!query) {
      // Loud, not empty: a silent `{results: []}` makes calling agents
      // conclude the KB has no content (observed live 2026-06-12).
      throw new Error(
        "knowledge_base_article_search requires a non-empty `query`."
      );
    }
    const strategy: SearchStrategy = request.strategy ?? "hybrid";

    const repos = resolveRepos(tenantId, scopeId);

    // Multi-KB fan-out: when `kb_id` is unset, list every accessible tenant
    // KB and merge per-KB hits — keeps the AGENTS rule alive.
    let kbs: KnowledgeBase[];
    const requestedKbId = filters.kb_id?.trim();
    if (requestedKbId) {
      const kb = await repos.kb.getById(requestedKbId);
      if (!kb) {
        return { results: [], total: 0 };
      }
      kbs = [kb];
    } else {
      kbs = await repos.kb.list();
    }
    if (kbs.length === 0) {
      return { results: [], total: 0 };
    }

    const partLimit = perKbLimit(limit, kbs.length);
    const merged: KbArticleSearchMatch[] = [];
    const timings: Record<string, number> = {};
    for (const kb of kbs) {
      const hits = await searchOneKb({
        filters,
        kb,
        limit: partLimit,
        query,
        repos,
        scopeId,
        strategy,
        tenantId,
      });
      merged.push(...hits);
      const hitTimings = (hits as any).__timings as
        | Record<string, number>
        | undefined;
      if (hitTimings) {
        for (const [k, v] of Object.entries(hitTimings)) {
          timings[k] = (timings[k] || 0) + v;
        }
      }
    }
    merged.sort((a, b) => b.score - a.score);
    const top = merged.slice(0, limit);

    return {
      results: top.map<SearchResult<KbArticleSearchMatch>>((m) => ({
        item: m,
        matched_fields: m.score > 0.5 ? ["chunk_text", "title"] : ["title"],
        score: m.score,
        source_scores: { fts: m.score, semantic: m.score },
      })),
      total: top.length,
      timings: Object.keys(timings).length > 0 ? timings : undefined,
    };
  }

  // Build a chunked SearchDocument for one article (called by SDK's declarative
  // re-index binding when only the doc id is on the bus).
  async function getDocumentById(input: {
    doc_id: string;
    tenant_id: string;
  }): Promise<SearchDocument | null> {
    const tenantId = input.tenant_id.trim();
    const articleId = input.doc_id.trim();
    if (!(tenantId && articleId)) {
      return null;
    }
    const { data, error } = await articlesTable()
      .select(
        "id, tenant_id, scope_id, kb_id, title, summary, questions_answered, content_markdown, deleted_at"
      )
      .eq("tenant_id", tenantId)
      .eq("id", articleId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) {
      return null;
    }
    const row = data as Record<string, unknown>;
    const text = compactSearchText([
      String(row.title ?? ""),
      row.summary ? String(row.summary) : null,
      Array.isArray(row.questions_answered)
        ? (row.questions_answered as string[]).join("\n")
        : null,
      row.content_markdown ? String(row.content_markdown) : null,
    ]);
    const doc = MDocument.fromMarkdown(text);
    const mastraChunks = await doc.chunk({
      strategy: "recursive",
      maxSize: MAX_CHUNK_LENGTH,
      overlap: CHUNK_OVERLAP,
    });
    const chunks: SearchChunk[] = mastraChunks.map((chunk, index) => ({
      chunk_id: `${articleId}::chunk::${index}`,
      chunk_index: index,
      doc_id: articleId,
      text: chunk.text,
    }));
    return {
      chunks,
      doc_id: articleId,
      metadata: { kb_id: String(row.kb_id ?? "") },
      scope_id: row.scope_id ? String(row.scope_id) : null,
      source_id: articleId,
      source_type: "kb.article",
      tenant_id: tenantId,
      text,
    };
  }

  async function deleteDocument(input: {
    doc_id: string;
    tenant_id: string;
  }): Promise<void> {
    const tenantId = input.tenant_id.trim();
    const articleId = input.doc_id.trim();
    if (!(tenantId && articleId)) {
      return;
    }
    await vectorStore.deleteVectors({
      indexName: "article_embeddings",
      filter: {
        tenant_id: tenantId,
        article_id: articleId,
      },
    });
  }

  async function replaceDocument(input: {
    document: SearchDocument;
  }): Promise<void> {
    const { document } = input;
    const tenantId = document.tenant_id?.trim();
    const articleId = document.doc_id?.trim();
    if (!(tenantId && articleId)) {
      return;
    }
    if (!document.text?.trim()) {
      await deleteDocument({ doc_id: articleId, tenant_id: tenantId });
      return;
    }
    let chunks: SearchChunk[];
    const repos = resolveRepos(tenantId, document.scope_id ?? "default");
    const settings = await repos.settings.get();
    const chunkStrategy = settings.chunk_strategy ?? "recursive";
    const chunkMaxLength = settings.chunk_max_length ?? MAX_CHUNK_LENGTH;
    const chunkOverlap = settings.chunk_overlap ?? CHUNK_OVERLAP;
    if (document.chunks?.length) {
      chunks = document.chunks;
    } else {
      const doc = MDocument.fromMarkdown(document.text);
      const mastraChunks = await doc.chunk({
        strategy: chunkStrategy as any,
        maxSize: chunkMaxLength,
        overlap: chunkOverlap,
      });
      chunks = mastraChunks.map((chunk, index) => ({
        chunk_id: `${articleId}::chunk::${index}`,
        chunk_index: index,
        doc_id: articleId,
        text: chunk.text,
      }));
    }
    if (chunks.length === 0) {
      await deleteDocument({ doc_id: articleId, tenant_id: tenantId });
      return;
    }

    const modelId = await resolveModelId(repos.settings);
    const embedder = buildKbEmbedder(modelId);
    const embeddings = await embedTexts(
      embedder,
      chunks.map((c) => c.text)
    );

    await vectorStore.upsert({
      indexName: "article_embeddings",
      vectors: embeddings,
      metadata: chunks.map((chunk) => ({
        tenant_id: tenantId,
        article_id: articleId,
        chunk_index: chunk.chunk_index,
        text: chunk.text,
      })),
    });
  }

  async function getStatus(input?: {
    tenant_id?: string | null;
    user_id?: string | null;
  }): Promise<SearchIndexStatus> {
    const tenantId = input?.tenant_id?.trim();
    if (!tenantId) {
      return {
        current_count: 0,
        indexed_count: 0,
        last_indexed_at: null,
        missing_count: 0,
        stale_count: 0,
        total_count: 0,
      };
    }
    const repos = resolveRepos(tenantId, "default");
    const settings = await repos.settings.get();
    // Reuse the existing aggregate RPC; trim the response into the generic
    // SearchIndexStatus shape. The dev panel that consumed the wide
    // `KbEmbeddingIndexStatus` is retired — admin UI uses the shared shape.
    const { data, error } = await supabase
      .schema(SCHEMA)
      .rpc("kb_embedding_index_status", {
        p_scope_id: "default",
        p_tenant_id: tenantId,
        p_track_limit: 100,
      });
    if (error) {
      throw new Error(
        `Failed to load KB embedding index status: ${error.message}`
      );
    }
    const raw =
      typeof data === "string"
        ? (JSON.parse(data) as unknown)
        : (data as unknown);
    const parsed = kbEmbeddingIndexStatusSchema.safeParse(raw);
    const row: KbEmbeddingIndexStatusRow = parsed.success
      ? parsed.data
      : {
          indexed_articles: 0,
          last_embedded_at: null,
          missing_count: 0,
          stale_count: 0,
          total_articles: 0,
        };
    void settings;
    return {
      current_count: Math.max(
        row.total_articles - row.missing_count - row.stale_count,
        0
      ),
      indexed_count: row.indexed_articles,
      last_indexed_at: row.last_embedded_at,
      missing_count: row.missing_count,
      stale_count: row.stale_count,
      total_count: row.total_articles,
    };
  }

  async function backfill(input?: {
    force?: boolean;
    limit?: number;
    tenant_id?: string | null;
    user_id?: string | null;
  }): Promise<{
    failed: number;
    processed: number;
    results: { article_id: string; error?: string; ok: boolean }[];
  }> {
    const tenantId = input?.tenant_id?.trim();
    if (!tenantId) {
      return { failed: 0, processed: 0, results: [] };
    }
    const limit = Math.min(
      Math.max(input?.limit ?? DEFAULT_BACKFILL_LIMIT, 1),
      MAX_BACKFILL_LIMIT
    );
    const { data: articleRows } = await articlesTable()
      .select("id, updated_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);
    const rows = (articleRows ?? []) as { id: string; updated_at: string }[];
    const targetIds = input?.force
      ? rows.map((r) => String(r.id))
      : await (async () => {
          const ids = rows.map((r) => String(r.id));
          if (ids.length === 0) {
            return [];
          }
          const { data: indexRows } = await embeddingsTable()
            .select("article_id, created_at")
            .eq("tenant_id", tenantId)
            .in("article_id", ids);
          const indexedAt = new Map<string, string>();
          for (const row of indexRows ?? []) {
            indexedAt.set(
              String((row as { article_id: string }).article_id),
              String((row as { created_at: string }).created_at)
            );
          }
          return rows
            .filter((r) => {
              const last = indexedAt.get(String(r.id));
              if (!last) {
                return true;
              }
              return (
                new Date(last).getTime() <
                new Date(String(r.updated_at)).getTime()
              );
            })
            .map((r) => String(r.id));
        })();

    const results: { article_id: string; error?: string; ok: boolean }[] = [];
    for (const id of targetIds) {
      try {
        const document = await getDocumentById({
          doc_id: id,
          tenant_id: tenantId,
        });
        if (document) {
          await replaceDocument({ document });
        } else {
          await deleteDocument({ doc_id: id, tenant_id: tenantId });
        }
        results.push({ article_id: id, ok: true });
      } catch (err) {
        results.push({
          article_id: id,
          error: err instanceof Error ? err.message : String(err),
          ok: false,
        });
      }
    }
    return {
      failed: results.filter((r) => !r.ok).length,
      processed: results.length,
      results,
    };
  }

  return {
    backfill,
    capabilities: CAPABILITIES,
    deleteDocument,
    getDocumentById,
    getStatus,
    id: "kb.article",
    replaceDocument,
    search,
    version: "1",
  };
}

// Type-only re-exports for plugin wiring.
export type { Article } from "../schema/types.js";
