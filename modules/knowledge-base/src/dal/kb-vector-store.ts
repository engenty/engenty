import type {
  CreateIndexParams,
  DeleteIndexParams,
  DeleteVectorParams,
  DeleteVectorsParams,
  DescribeIndexParams,
  IndexStats,
  QueryResult,
  QueryVectorParams,
  UpdateVectorParams,
  UpsertVectorParams,
} from "@mastra/core/vector";
import { MastraVector } from "@mastra/core/vector";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidv7 } from "uuidv7";
import {
  isKbSearchVerifierConfigured,
  type KbSearchVerifierCandidate,
  shouldVerifyKbSearchQuery,
  verifyKbSearchResults,
} from "../services/kb-search-verifier.js";

function stripTsHeadlineMarks(headline: string): string {
  return headline.replaceAll("<<", "").replaceAll(">>", "");
}

function normalizeFtsRank(rank: number): number {
  if (!Number.isFinite(rank) || rank <= 0) {
    return 0.35;
  }
  return Math.min(0.99, 0.35 + Math.log1p(rank) / 8);
}

function findLineNumbers(
  content: string,
  chunk: string
): { startLine: number; endLine: number } | null {
  if (!(content && chunk)) {
    return null;
  }

  const cleanStr = (s: string) => s.replace(/\r\n/g, "\n");
  const cleanContent = cleanStr(content);
  const cleanChunk = cleanStr(chunk).trim();

  // Try exact match first
  const index = cleanContent.indexOf(cleanChunk);
  if (index !== -1) {
    const linesBefore = cleanContent.slice(0, index).split("\n");
    const startLine = linesBefore.length;
    const matchLines = cleanChunk.split("\n");
    const endLine = startLine + matchLines.length - 1;
    return { startLine, endLine };
  }

  // Fallback to fuzzy line-by-line matching
  const contentLines = cleanContent.split("\n");
  const chunkLines = cleanChunk
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (chunkLines.length === 0) {
    return null;
  }

  const firstChunkLine = chunkLines[0]!;
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i]!.trim();
    if (line.includes(firstChunkLine) || firstChunkLine.includes(line)) {
      let matches = true;
      for (let j = 1; j < chunkLines.length; j++) {
        if (i + j >= contentLines.length) {
          matches = false;
          break;
        }
        const nextLine = contentLines[i + j]!.trim();
        const nextChunkLine = chunkLines[j]!;
        if (
          !(
            nextLine.includes(nextChunkLine) || nextChunkLine.includes(nextLine)
          )
        ) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return { startLine: i + 1, endLine: i + chunkLines.length };
      }
    }
  }

  return null;
}

function matchesOperatorFilter(value: any, filterExpr: any): boolean {
  if (filterExpr === undefined || filterExpr === null) {
    return true;
  }
  if (typeof filterExpr !== "object" || filterExpr === null) {
    return value === filterExpr;
  }

  for (const op of Object.keys(filterExpr)) {
    const val = filterExpr[op];
    if (op === "$eq") {
      if (value !== val) {
        return false;
      }
    } else if (op === "$ne") {
      if (value === val) {
        return false;
      }
    } else if (op === "$in") {
      if (!(Array.isArray(val) && val.includes(value))) {
        return false;
      }
    } else if (op === "$nin" && Array.isArray(val) && val.includes(value)) {
      return false;
    }
  }
  return true;
}

function matchesMetadata(
  meta: Record<string, any>,
  filter: Record<string, any>
): boolean {
  for (const key of Object.keys(filter)) {
    if (key.startsWith("$")) {
      if (key === "$and" && Array.isArray(filter[key])) {
        if (!filter[key].every((sub: any) => matchesMetadata(meta, sub))) {
          return false;
        }
      } else if (
        key === "$or" &&
        Array.isArray(filter[key]) &&
        !filter[key].some((sub: any) => matchesMetadata(meta, sub))
      ) {
        return false;
      }
      continue;
    }
    const value = meta[key];
    const expr = filter[key];
    if (!matchesOperatorFilter(value, expr)) {
      return false;
    }
  }
  return true;
}

export interface EngentyKbVectorStoreOptions {
  id: string;
  resolveRepos: (
    tenantId: string,
    scopeId: string
  ) => {
    articles: any;
    kb: any;
    settings: any;
  };
  supabase: SupabaseClient;
}

export class EngentyKbVectorStore extends MastraVector<any> {
  private readonly supabase: SupabaseClient;
  private readonly resolveRepos: (
    tenantId: string,
    scopeId: string
  ) => {
    articles: any;
    kb: any;
    settings: any;
  };

  constructor(options: EngentyKbVectorStoreOptions) {
    super({ id: options.id });
    this.supabase = options.supabase;
    this.resolveRepos = options.resolveRepos;
  }

  async query(params: QueryVectorParams<any>): Promise<QueryResult[]> {
    const filter = params.filter ?? {};
    const tenantId = filter.tenant_id || filter.tenantId;
    if (!tenantId) {
      throw new Error("tenant_id is required in query filters");
    }
    const scopeId = filter.scope_id || filter.scopeId || "default";
    const kbId = filter.kb_id || filter.kbId || params.indexName;
    const query = filter.query || filter.queryText || "";
    const strategy = filter.strategy || "hybrid";
    const limit = params.topK ?? 10;

    const repos = this.resolveRepos(tenantId, scopeId);

    // Filter results based on metadata filter (excluding standard keys handled above)
    const getCleanFilter = () => {
      const {
        tenant_id: _t1,
        tenantId: _t2,
        scope_id: _s1,
        scopeId: _s2,
        kb_id: _k1,
        kbId: _k2,
        query: _q1,
        queryText: _q2,
        strategy: _st,
        use_vector: _uv,
        fts_fallback: _ff,
        verifier: _ve,
        match_threshold: _mt,
        max_vector_distance: _md,
        ...cleanFilter
      } = filter;
      return cleanFilter;
    };

    let tVectorMs = 0;
    let tVerifierMs = 0;
    let tFtsMs = 0;

    const articlesMap: Record<
      string,
      {
        category_id: string | null;
        status: string;
        slug: string;
        content_markdown: string | null;
      }
    > = {};

    const loadMissingArticles = async (ids: string[]) => {
      const missing = ids.filter((id) => !articlesMap[id]);
      if (missing.length === 0) {
        return;
      }
      const { data } = await this.supabase
        .schema("module_kb")
        .from("articles")
        .select("id, category_id, status, slug, content_markdown")
        .in("id", missing);
      if (data) {
        for (const art of data) {
          articlesMap[art.id] = {
            category_id: art.category_id,
            status: art.status,
            slug: art.slug,
            content_markdown: art.content_markdown,
          };
        }
      }
    };

    // 1. If strategy is lexical-only, run FTS suggest and return
    if (strategy === "lexical" || filter.use_vector === false) {
      const t0 = performance.now();
      const fts = await repos.articles.suggestFts(kbId, query, limit);
      tFtsMs = performance.now() - t0;

      const ftsIds = fts.map((h: any) => h.id);
      await loadMissingArticles(ftsIds);

      const results = fts.slice(0, limit).map((h: any) => {
        const artInfo = articlesMap[h.id] ?? {
          category_id: null,
          status: "published",
          slug: "",
          content_markdown: null,
        };

        let start_line: number | undefined;
        let end_line: number | undefined;
        const text = stripTsHeadlineMarks(h.headline).trim() || h.title;
        if (artInfo.content_markdown) {
          const lines = findLineNumbers(artInfo.content_markdown, text);
          if (lines) {
            start_line = lines.startLine;
            end_line = lines.endLine;
          }
        }

        return {
          id: h.id,
          score: normalizeFtsRank(h.rank),
          metadata: {
            title: h.title,
            text,
            kb_id: kbId,
            kbId,
            tenant_id: tenantId,
            tenantId,
            scope_id: scopeId,
            scopeId,
            article_id: h.id,
            articleId: h.id,
            category_id: artInfo.category_id,
            categoryId: artInfo.category_id,
            status: artInfo.status,
            slug: artInfo.slug,
            start_line,
            end_line,
          },
        };
      });

      const cleanFilter = getCleanFilter();
      return results.filter((r) => matchesMetadata(r.metadata, cleanFilter));
    }

    // Resolve settings for thresholds and verifier config
    const settings = await repos.settings.get();
    const matchThreshold =
      filter.match_threshold === undefined
        ? settings.search_vector_min_similarity
        : filter.match_threshold;
    const maxVectorDistance =
      filter.max_vector_distance === undefined
        ? null
        : filter.max_vector_distance;
    const ftsFallback = filter.fts_fallback !== false;

    // 2. Query vector embeddings from DB RPC
    const t0Vec = performance.now();
    const rpcArgs: Record<string, any> = {
      p_tenant_id: tenantId,
      p_scope_id: scopeId,
      p_kb_id: kbId,
      p_embedding: params.queryVector
        ? JSON.stringify(params.queryVector)
        : "[]",
      p_match_count: limit,
      p_match_threshold: matchThreshold ?? 0,
      p_max_cosine_distance: maxVectorDistance,
    };

    const { data: vectorData, error } = await this.supabase
      .schema("module_kb")
      .rpc("search_kb_embeddings", rpcArgs);

    if (error) {
      throw new Error(`KB vector search failed: ${error.message}`);
    }
    tVectorMs = performance.now() - t0Vec;

    let vectorResults: QueryResult[] = [];
    if (vectorData && vectorData.length > 0) {
      const articleIds = vectorData.map((row: any) => row.article_id);
      await loadMissingArticles(articleIds);

      vectorResults = vectorData.map((row: any) => {
        const artInfo = articlesMap[row.article_id] ?? {
          category_id: null,
          status: "draft",
          slug: "",
          content_markdown: null,
        };

        let start_line: number | undefined;
        let end_line: number | undefined;
        if (artInfo.content_markdown) {
          const lines = findLineNumbers(
            artInfo.content_markdown,
            row.chunk_text
          );
          if (lines) {
            start_line = lines.startLine;
            end_line = lines.endLine;
          }
        }

        return {
          id: row.article_id,
          score: row.similarity ?? 0,
          metadata: {
            title: row.title,
            text: row.chunk_text,
            kb_id: kbId,
            kbId,
            tenant_id: tenantId,
            tenantId,
            scope_id: scopeId,
            scopeId,
            article_id: row.article_id,
            articleId: row.article_id,
            category_id: artInfo.category_id,
            categoryId: artInfo.category_id,
            status: artInfo.status,
            slug: artInfo.slug,
            start_line,
            end_line,
          },
        };
      });
    }

    // 3. Run LLM verifier if configured and requested
    if (
      filter.verifier === true &&
      vectorResults.length > 0 &&
      isKbSearchVerifierConfigured() &&
      shouldVerifyKbSearchQuery(query, settings)
    ) {
      const t0Ver = performance.now();
      const candidates: KbSearchVerifierCandidate[] = await Promise.all(
        vectorResults
          .slice(0, settings.search_verifier_max_candidates)
          .map(async (result) => ({
            article: await repos.articles.getById(result.id),
            result: {
              article_id: result.id,
              chunk_text: result.metadata?.text ?? "",
              score: result.score,
              title: result.metadata?.title ?? "",
            },
          }))
      );
      const verified = await verifyKbSearchResults({
        candidates,
        query,
        settings,
      });
      tVerifierMs = performance.now() - t0Ver;

      const verifiedIds = new Set(verified.map((v) => v.article_id));
      vectorResults = vectorResults
        .filter((r) => verifiedIds.has(r.id))
        .map((r) => {
          const vItem = verified.find((v) => v.article_id === r.id);
          return {
            ...r,
            score: vItem ? vItem.score : r.score,
          };
        });
    }

    let mergedResults = vectorResults;

    // 4. Merge FTS fallback if hybrid search and fts_fallback is true
    if (ftsFallback && strategy === "hybrid") {
      const t0Fts = performance.now();
      const fts = await repos.articles.suggestFts(kbId, query, limit);
      tFtsMs = performance.now() - t0Fts;
      if (vectorResults.length === 0) {
        const ftsIds = fts.map((h: any) => h.id);
        await loadMissingArticles(ftsIds);

        mergedResults = fts.slice(0, limit).map((h: any) => {
          const artInfo = articlesMap[h.id] ?? {
            category_id: null,
            status: "published",
            slug: "",
            content_markdown: null,
          };

          let start_line: number | undefined;
          let end_line: number | undefined;
          const text = stripTsHeadlineMarks(h.headline).trim() || h.title;
          if (artInfo.content_markdown) {
            const lines = findLineNumbers(artInfo.content_markdown, text);
            if (lines) {
              start_line = lines.startLine;
              end_line = lines.endLine;
            }
          }

          return {
            id: h.id,
            score: normalizeFtsRank(h.rank),
            metadata: {
              title: h.title,
              text,
              kb_id: kbId,
              kbId,
              tenant_id: tenantId,
              tenantId,
              scope_id: scopeId,
              scopeId,
              article_id: h.id,
              articleId: h.id,
              category_id: artInfo.category_id,
              categoryId: artInfo.category_id,
              status: artInfo.status,
              slug: artInfo.slug,
              start_line,
              end_line,
            },
          };
        });
      } else {
        const minVec = Math.min(...vectorResults.map((v) => v.score));
        const lexicalScoreCap = Math.max(0.08, minVec * 0.82);
        const seen = new Set(vectorResults.map((v) => v.id));
        const merged = [...vectorResults];

        const ftsIds = fts.map((h: any) => h.id);
        await loadMissingArticles(ftsIds);

        for (const h of fts) {
          if (merged.length >= limit) {
            break;
          }
          if (seen.has(h.id)) {
            continue;
          }
          seen.add(h.id);

          const artInfo = articlesMap[h.id] ?? {
            category_id: null,
            status: "published",
            slug: "",
            content_markdown: null,
          };

          let start_line: number | undefined;
          let end_line: number | undefined;
          const text = stripTsHeadlineMarks(h.headline).trim() || h.title;
          if (artInfo.content_markdown) {
            const lines = findLineNumbers(artInfo.content_markdown, text);
            if (lines) {
              start_line = lines.startLine;
              end_line = lines.endLine;
            }
          }

          merged.push({
            id: h.id,
            score: Math.min(normalizeFtsRank(h.rank), lexicalScoreCap),
            metadata: {
              title: h.title,
              text,
              kb_id: kbId,
              kbId,
              tenant_id: tenantId,
              tenantId,
              scope_id: scopeId,
              scopeId,
              article_id: h.id,
              articleId: h.id,
              category_id: artInfo.category_id,
              categoryId: artInfo.category_id,
              status: artInfo.status,
              slug: artInfo.slug,
              start_line,
              end_line,
            },
          });
        }
        mergedResults = merged;
      }
    }

    const cleanFilter = getCleanFilter();
    mergedResults = mergedResults.filter((r) =>
      matchesMetadata(r.metadata, cleanFilter)
    );

    mergedResults.sort((a, b) => b.score - a.score);
    const finalResults = mergedResults.slice(0, limit);
    (finalResults as any).__timings = {
      ...(tVectorMs > 0 ? { vector: Math.round(tVectorMs) } : {}),
      ...(tVerifierMs > 0 ? { verifier: Math.round(tVerifierMs) } : {}),
      ...(tFtsMs > 0 ? { bm25: Math.round(tFtsMs) } : {}),
    };
    return finalResults;
  }

  async upsert(params: UpsertVectorParams): Promise<string[]> {
    const { vectors, metadata } = params;
    if (!vectors || vectors.length === 0) {
      return [];
    }

    const now = new Date().toISOString();
    const rows = vectors.map((embedding, i) => {
      const meta = metadata?.[i] ?? {};
      const tenantId = meta.tenant_id || meta.tenantId;
      const articleId = meta.article_id || meta.articleId;
      if (!tenantId) {
        throw new Error("tenant_id is required in chunk metadata");
      }
      if (!articleId) {
        throw new Error("article_id is required in chunk metadata");
      }
      return {
        id: uuidv7(),
        tenant_id: tenantId,
        article_id: articleId,
        chunk_index: meta.chunk_index ?? i,
        chunk_text: meta.text || meta.chunk_text || "",
        embedding,
        created_at: now,
      };
    });

    const uniqueArticleIds = Array.from(
      new Set(rows.map((r) => r.article_id).filter(Boolean))
    );

    for (const articleId of uniqueArticleIds) {
      const { error: delErr } = await this.supabase
        .schema("module_kb")
        .from("article_embeddings")
        .delete()
        .eq("article_id", articleId);
      if (delErr) {
        throw new Error(
          `Failed to clear vector store embeddings for article ${articleId}: ${delErr.message}`
        );
      }
    }

    const { error: insErr } = await this.supabase
      .schema("module_kb")
      .from("article_embeddings")
      .insert(rows);

    if (insErr) {
      throw new Error(
        `Failed to insert vector store embeddings: ${insErr.message}`
      );
    }

    return rows.map((r) => r.id);
  }

  async createIndex(params: CreateIndexParams): Promise<void> {
    return;
  }

  async listIndexes(): Promise<string[]> {
    return [];
  }

  async describeIndex(params: DescribeIndexParams): Promise<IndexStats> {
    const { count, error } = await this.supabase
      .schema("module_kb")
      .from("article_embeddings")
      .select("*", { count: "exact", head: true });

    if (error) {
      throw new Error(`Failed to describe index stats: ${error.message}`);
    }

    return {
      dimension: 1536,
      count: count ?? 0,
      metric: "cosine",
    };
  }

  async deleteIndex(params: DeleteIndexParams): Promise<void> {
    return;
  }

  async updateVector(params: UpdateVectorParams<any>): Promise<void> {
    const id = (params as any).id;
    if (id) {
      const { error } = await this.supabase
        .schema("module_kb")
        .from("article_embeddings")
        .update({
          ...(params.update.vector ? { embedding: params.update.vector } : {}),
          ...(params.update.metadata?.text
            ? { chunk_text: params.update.metadata.text }
            : {}),
        })
        .eq("id", id);
      if (error) {
        throw error;
      }
    }
  }

  async deleteVector(params: DeleteVectorParams): Promise<void> {
    const { error } = await this.supabase
      .schema("module_kb")
      .from("article_embeddings")
      .delete()
      .eq("id", params.id);
    if (error) {
      throw error;
    }
  }

  async deleteVectors(params: DeleteVectorsParams<any>): Promise<void> {
    const { ids, filter } = params;
    if (ids && ids.length > 0) {
      const { error } = await this.supabase
        .schema("module_kb")
        .from("article_embeddings")
        .delete()
        .in("id", ids);
      if (error) {
        throw error;
      }
    } else if (filter) {
      const tenantId = filter.tenant_id || filter.tenantId;
      const articleId = filter.article_id || filter.articleId;
      let query = this.supabase
        .schema("module_kb")
        .from("article_embeddings")
        .delete();
      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      if (articleId) {
        query = query.eq("article_id", articleId);
      }
      const { error } = await query;
      if (error) {
        throw error;
      }
    }
  }
}
