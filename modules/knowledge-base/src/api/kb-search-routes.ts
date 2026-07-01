import type { KbArticlesSearchProvider } from "../dal/kb-articles-search-index-provider.js";
import type { KbServerApi } from "./kb-api-shared.js";
import { badRequest, qp } from "./kb-api-shared.js";

export function registerKbSearchRoutes(
  api: KbServerApi,
  searchProvider: KbArticlesSearchProvider
) {
  /* ── Search (thin HTTP wrappers around the unified provider) ── */

  // Legacy `/api/kb/search` and `/api/kb/search/suggest` are kept *only* as
  // thin wrappers around `searchProvider.search` so existing UI clients
  // (`searchKb` / `suggestKbArticles`) keep working without re-routing every
  // hub keystroke through the synthesized op invoker.
  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/search",
    handler: async (ctx) => {
      if (!ctx.auth) {
        return badRequest("Auth required");
      }
      const body = (await ctx.request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const query = typeof body.query === "string" ? body.query : "";
      const kbId = typeof body.kb_id === "string" ? body.kb_id : undefined;
      const limit =
        typeof body.limit === "number" && Number.isFinite(body.limit)
          ? body.limit
          : 10;
      const strategy: "lexical" | "semantic" | "hybrid" | undefined =
        body.use_vector === false
          ? "lexical"
          : body.strategy === "lexical" ||
              body.strategy === "semantic" ||
              body.strategy === "hybrid"
            ? body.strategy
            : undefined;
      const response = await searchProvider.search({
        filters: {
          fts_fallback:
            typeof body.fts_fallback === "boolean"
              ? body.fts_fallback
              : undefined,
          kb_id: kbId,
          match_threshold:
            typeof body.match_threshold === "number"
              ? body.match_threshold
              : body.match_threshold === null
                ? null
                : undefined,
          max_vector_distance:
            typeof body.max_vector_distance === "number"
              ? body.max_vector_distance
              : body.max_vector_distance === null
                ? null
                : undefined,
          scope_id: ctx.auth.scopeId ?? null,
          tenant_id: ctx.auth.tenantId,
          use_vector:
            typeof body.use_vector === "boolean" ? body.use_vector : undefined,
          verifier:
            typeof body.verifier === "boolean" ? body.verifier : undefined,
        },
        limit,
        query,
        ...(strategy ? { strategy } : {}),
      });
      // Legacy UI shape: KbSearchResult[] (article_id, chunk_text, score, title)
      return {
        results: response.results.map((r) => ({
          article_id: r.item.article_id,
          chunk_text: r.item.chunk_text,
          score: r.item.score,
          title: r.item.title,
        })),
        timings: response.timings,
      };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/search/suggest",
    handler: async (ctx) => {
      if (!ctx.auth) {
        return badRequest("Auth required");
      }
      const params = qp(ctx);
      const kbId = params.get("kb_id");
      const q = params.get("q") ?? "";
      const rawLimit = Number(params.get("limit") ?? "8");
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 25)
        : 8;
      if (!kbId) {
        return badRequest("kb_id required");
      }
      // `strategy: "lexical"` keeps every keystroke on BM25 / FTS only; the
      // provider short-circuits the embedder.
      const response = await searchProvider.search({
        filters: {
          kb_id: kbId,
          scope_id: ctx.auth.scopeId ?? null,
          tenant_id: ctx.auth.tenantId,
        },
        limit,
        query: q,
        strategy: "lexical",
      });
      return response.results.map((r, i) => ({
        headline: r.item.chunk_text,
        id: r.item.article_id,
        kb_id: r.item.kb_id,
        rank: response.results.length - i,
        title: r.item.title,
      }));
    },
  });
}
