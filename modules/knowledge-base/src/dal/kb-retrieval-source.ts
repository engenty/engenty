// `kb.article` retrieval source (retrieval-service Phase 2 — replaces the
// hand-rolled provider + EngentyKbVectorStore).
//
// The central service owns storage (search.documents/chunks), chunk
// embedding, the fused FTS+vector query, status, and backfill. This module
// contributes what is genuinely KB-specific:
//
//   - document building (article markdown, title, kb_id metadata)
//   - per-tenant Mastra chunking + embedding model from `kb_settings`
//   - the lexical fast path for as-you-type queries (`fastPath`)
//   - the LLM verifier as a `RetrievalEvaluator` (drops irrelevant hits on
//     multi-term queries; fails open when the AI gateway is unconfigured)
//   - hydration back into the public `KbArticleSearchMatch` shape
//
// Deviations from the legacy provider, both intentional:
//   - The verifier now runs by default on qualifying queries (legacy needed
//     `filters.verifier: true`) — hybrid results are verified, per the
//     Phase 2 spec.
//   - Multi-KB fairness caps are gone: all KBs pool in one fused ranking.
//     The old per-KB limit only compensated for per-KB query fan-out.

import type {
  RetrievalEvaluator,
  RetrievalMatch,
  RetrievalSourceRegistration,
} from "@engenty/retrieval";
import { mastraSplitter } from "@engenty/retrieval/mastra-splitter";
import type { SearchIndexProvider, SearchResult } from "@engenty/search-index";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kbArticlePath } from "../../ui/kb-paths.js";
import type { Article, KbSearchResult } from "../schema/types.js";
import {
  isKbSearchVerifierConfigured,
  shouldVerifyKbSearchQuery,
  verifyKbSearchResults,
} from "../services/kb-search-verifier.js";
import type { KbSettingsRepo } from "./contracts.js";
import { DEFAULT_KB_SETTINGS, SCHEMA } from "./shared.js";

export const KB_ARTICLE_SOURCE_TYPE = "kb.article";
// As-you-type quick search stays lexical (no embedding round-trip) up to
// this many terms; matches the legacy BM25-first UX.
const FAST_PATH_MAX_TERMS = 2;

/** Public filter surface of the synthesized tool — unchanged from v1. */
export interface KbArticlesSearchFilters {
  kb_id?: string;
  scope_id?: string | null;
  tenant_id?: string | null;
}

export interface KbArticleSearchMatch extends KbSearchResult {
  end_line?: number;
  kb_id: string;
  kb_name: string;
  start_line?: number;
}

/** Kept for the internal API routes (kb-search, kb-chat) that hold the
 *  manufactured provider. */
export type KbArticlesSearchProvider = SearchIndexProvider<
  never,
  KbArticlesSearchFilters,
  KbArticleSearchMatch
>;

export interface CreateKbRetrievalSourceOptions {
  resolveRepos: (
    tenantId: string,
    scopeId: string
  ) => { settings: KbSettingsRepo };
  supabase: SupabaseClient;
}

interface ArticleRow {
  content_markdown: string | null;
  id: string;
  kb_id: string;
  questions_answered: unknown;
  scope_id: string;
  slug: string;
  status: string;
  summary: string | null;
  title: string;
  updated_at: string;
}

export function createKbRetrievalSource(
  options: CreateKbRetrievalSourceOptions
): RetrievalSourceRegistration<KbArticleSearchMatch> {
  const { resolveRepos, supabase } = options;
  const articles = () => supabase.schema(SCHEMA).from("articles");
  const kbs = () => supabase.schema(SCHEMA).from("knowledge_bases");

  async function resolveSettings(tenantId: string, scopeId: string) {
    try {
      return await resolveRepos(tenantId, scopeId).settings.get();
    } catch {
      return DEFAULT_KB_SETTINGS;
    }
  }

  async function loadArticles(
    tenantId: string,
    ids: string[]
  ): Promise<Map<string, ArticleRow>> {
    if (ids.length === 0) {
      return new Map();
    }
    const { data, error } = await articles()
      .select(
        "id, kb_id, scope_id, slug, status, title, summary, questions_answered, content_markdown, updated_at"
      )
      .eq("tenant_id", tenantId)
      .in("id", ids)
      .is("deleted_at", null);
    if (error) {
      throw new Error(`KB article load failed: ${error.message}`);
    }
    return new Map(
      ((data ?? []) as ArticleRow[]).map((row) => [String(row.id), row])
    );
  }

  const verifierEvaluator: RetrievalEvaluator = {
    evaluate: async (matches, ctx) => {
      const settings = await resolveSettings(ctx.tenant_id, "default");
      const byArticle = await loadArticles(
        ctx.tenant_id,
        Array.from(new Set(matches.map((match) => match.doc_id)))
      );
      const candidates = matches.map((match) => ({
        article: (byArticle.get(match.doc_id) ?? null) as Article | null,
        result: toKbSearchResult(match),
      }));
      const surviving = await verifyKbSearchResults({
        candidates,
        query: ctx.query,
        settings,
      });
      const keep = new Set(surviving.map((result) => result.article_id));
      // Verifier caps candidates (search_verifier_max_candidates); anything
      // beyond the submitted window passes through unjudged, like legacy.
      const judgedWindow = new Set(
        candidates
          .slice(0, Math.max(settings.search_verifier_max_candidates, 1))
          .map((candidate) => candidate.result.article_id)
      );
      // The verifier trims the tail — it never vetoes the best fused hit
      // (judging a lone table-fragment chunk under-informs the model), and a
      // fully-rejected set falls back to the fused ranking rather than
      // blanking results the ranker considered relevant.
      const topDocId = matches[0]?.doc_id;
      const kept = matches.filter(
        (match) =>
          match.doc_id === topDocId ||
          !judgedWindow.has(match.doc_id) ||
          keep.has(match.doc_id)
      );
      return kept.length > 0 ? kept : matches;
    },
    id: "kb-search-verifier",
    shouldRun: async (ctx) => {
      if (!isKbSearchVerifierConfigured()) {
        return false;
      }
      const settings = await resolveSettings(ctx.tenant_id, "default");
      return shouldVerifyKbSearchQuery(ctx.query, settings);
    },
  };

  function toKbSearchResult(match: RetrievalMatch): KbSearchResult {
    return {
      article_id: match.doc_id,
      chunk_text: match.text,
      score: match.score,
      title: match.title ?? "",
    };
  }

  async function hydrate(
    matches: RetrievalMatch[],
    ctx: { tenant_id: string }
  ): Promise<SearchResult<KbArticleSearchMatch>[]> {
    const articleRows = await loadArticles(
      ctx.tenant_id,
      Array.from(new Set(matches.map((match) => match.doc_id)))
    );
    const kbIds = Array.from(
      new Set(Array.from(articleRows.values()).map((row) => String(row.kb_id)))
    );
    const { data: kbRows } = kbIds.length
      ? await kbs().select("id, name, slug").in("id", kbIds)
      : { data: [] };
    const kbById = new Map(
      ((kbRows ?? []) as { id: string; name: string; slug: string }[]).map(
        (row) => [String(row.id), row]
      )
    );
    const results: SearchResult<KbArticleSearchMatch>[] = [];
    for (const match of matches) {
      const article = articleRows.get(match.doc_id);
      if (!article) {
        continue;
      }
      const kb = kbById.get(String(article.kb_id));
      results.push({
        item: {
          article_id: match.doc_id,
          chunk_text: match.text,
          kb_id: String(article.kb_id),
          kb_name: kb?.name ?? "",
          kb_slug: kb?.slug,
          score: match.score,
          slug: article.slug,
          title: article.title,
          url: kb?.slug ? kbArticlePath(kb.slug, article.slug) : undefined,
        },
        matched_fields: match.matched_fields,
        score: match.score,
        source_scores: { ...match.source_scores },
      });
    }
    return results;
  }

  return {
    buildDocument: async ({ doc_id, tenant_id }) => {
      const found = await loadArticles(tenant_id, [doc_id]);
      const row = found.get(doc_id);
      if (!row) {
        return null;
      }
      return {
        doc_id,
        filter_metadata: { kb_id: String(row.kb_id) },
        occurred_at: row.updated_at,
        source_id: doc_id,
        source_type: KB_ARTICLE_SOURCE_TYPE,
        source_updated_at: row.updated_at,
        scope_id: row.scope_id,
        tenant_id,
        text: row.content_markdown ?? "",
        title: row.title,
      };
    },
    embedding: {
      resolveModel: async (tenantId) => {
        const settings = await resolveSettings(tenantId, "default");
        return (
          settings.embedding_model?.trim() ||
          DEFAULT_KB_SETTINGS.embedding_model
        );
      },
    },
    listDocuments: async ({ limit, tenant_id }) => {
      const { data, error } = await articles()
        .select("id, updated_at")
        .eq("tenant_id", tenant_id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`KB article list failed: ${error.message}`);
      }
      return ((data ?? []) as { id: string; updated_at: string }[]).map(
        (row) => ({
          doc_id: String(row.id),
          updated_at: String(row.updated_at),
        })
      );
    },
    module_id: "knowledge-base",
    onEvents: [
      {
        action: "replace",
        docId: (payload) =>
          (payload as { article_id?: string }).article_id ?? null,
        name: "knowledge-base.article.created",
      },
      {
        action: "replace",
        docId: (payload) =>
          (payload as { article_id?: string }).article_id ?? null,
        name: "knowledge-base.article.updated",
      },
      {
        action: "delete",
        docId: (payload) =>
          (payload as { article_id?: string }).article_id ?? null,
        name: "knowledge-base.article.deleted",
      },
    ],
    operation: {
      entityName: "article",
      overrides: {
        idempotent: true,
        requiredCapabilities: ["module.knowledge-base.read"],
        riskLevel: "low",
        summary:
          "Search knowledge-base articles (hybrid lexical + semantic with relevance verification; short queries stay instant/lexical)",
      },
    },
    retriever: {
      evaluators: [verifierEvaluator],
      fastPath: { maxTerms: FAST_PATH_MAX_TERMS },
      hydrate,
      vectorThreshold: async (tenantId) => {
        const settings = await resolveSettings(tenantId, "default");
        return (
          settings.search_vector_min_similarity ??
          DEFAULT_KB_SETTINGS.search_vector_min_similarity
        );
      },
      mapFilters: (filters) => ({
        metadata:
          typeof filters.kb_id === "string" && filters.kb_id.trim()
            ? { kb_id: filters.kb_id.trim() }
            : undefined,
        scope_id:
          typeof filters.scope_id === "string" ? filters.scope_id : undefined,
      }),
    },
    source_type: KB_ARTICLE_SOURCE_TYPE,
    splitter: mastraSplitter(async (document) => {
      const settings = await resolveSettings(
        document.tenant_id,
        document.scope_id ?? "default"
      );
      return {
        maxSize: settings.chunk_max_length ?? 1000,
        overlap: settings.chunk_overlap ?? 100,
        strategy: settings.chunk_strategy ?? "recursive",
      };
    }),
    visibility: "tenant",
  };
}
