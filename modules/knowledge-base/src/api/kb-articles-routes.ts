import { actorUserIdFromAuth } from "@engenty/plugin-sdk";
import { createLogger } from "@engenty/telemetry";
import { safeArticleExportBasename } from "../../ui/lib/article-markdown-export.js";
import { onlyRequestedKeys } from "../schema/only-requested-keys.js";
import type { ArticlesQueryParams } from "../schema/types.js";
import {
  articleCommentCreateSchema,
  articleCommentUpdateSchema,
  articleCreateSchema,
  articlesQuerySchema,
  articleUpdateSchema,
  kbArticleGenerateSummarySchema,
} from "../schema/zod.js";
import { buildArticlePdfHtml } from "../services/article-pdf-html.js";
import {
  convertHtmlToPdf,
  isGotenbergHtmlToPdfConfigured,
} from "../services/gotenberg-html-to-pdf.js";
import { resolveKbArticleDataSourceLink } from "../services/kb-article-data-source-link.js";
import { refreshKbArticleMetadata } from "../services/kb-article-metadata-refresh.js";
import { generateKbArticleSummary } from "../services/kb-article-summary-generate.js";
import { resolveKbEffectiveCommentsModeForArticle } from "../services/kb-effective-comments-mode.js";
import { resolveKbInheritedCoverForArticle } from "../services/kb-effective-cover.js";
import { resolveKbTemplateForArticle } from "../services/kb-template-resolver.js";
import type { GetKbRepo, KbServerApi } from "./kb-api-shared.js";
import {
  badRequest,
  conflict,
  created,
  jsonError,
  notFound,
  parseBody,
  qp,
  readRouteJsonBody,
} from "./kb-api-shared.js";

const logger = createLogger({ name: "kb-api" });

export function registerKbArticleRoutes(api: KbServerApi, getRepo: GetKbRepo) {
  /* ── Articles CRUD ── */

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/articles",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const sp = qp(ctx);
      const raw: Record<string, unknown> = {};
      for (const key of [
        "kb_id",
        "category_id",
        "parent_article_id",
        "status",
        "search",
        "page",
        "page_size",
        "sort_by",
        "sort_order",
        "top_level_only",
        "search_fts",
      ]) {
        const v = sp.get(key);
        if (v !== null && v !== "") {
          if (["page", "page_size"].includes(key)) {
            raw[key] = Number.parseInt(v, 10);
          } else if (["top_level_only", "search_fts"].includes(key)) {
            raw[key] = v === "true" || v === "1";
          } else {
            raw[key] = v;
          }
        }
      }
      const templatePropertyFilters: Record<string, string | number | null> =
        {};
      for (const [key, value] of sp.entries()) {
        if (!key.startsWith("property.")) {
          continue;
        }
        const propKey = key.slice("property.".length).trim();
        if (propKey) {
          templatePropertyFilters[propKey] = value;
        }
      }
      if (Object.keys(templatePropertyFilters).length > 0) {
        raw.template_property_filters = templatePropertyFilters;
      }
      const params = articlesQuerySchema.parse(raw) as ArticlesQueryParams;
      const result = await repos.articles.listPaginated(params);
      return result;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/articles",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const { tag_ids, ...rest } = articleCreateSchema.parse(
        await ctx.request.json().catch(() => ({}))
      );
      const article = await repos.articles.create(
        {
          ...rest,
          parent_article_id: rest.parent_article_id ?? null,
          content_json: rest.content_json ?? null,
          content_markdown: rest.content_markdown ?? null,
          summary: rest.summary ?? null,
          original_document_url: rest.original_document_url ?? null,
          original_document_name: rest.original_document_name ?? null,
          custom_properties: rest.custom_properties ?? {},
        },
        tag_ids,
        ctx.auth ? { principalId: ctx.auth.principalId } : null
      );
      logger.info("Article created", { id: article.id, title: article.title });
      // The DAL emits `knowledge-base.article.created`; the SDK declarative
      // re-index binding handles the embedding refresh.
      return created(article);
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/articles/comment-counts",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const idsParam = qp(ctx).get("ids") ?? "";
      const ids = [
        ...new Set(
          idsParam
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        ),
      ];
      if (ids.length === 0) {
        return {};
      }
      const counts = await repos.article_comments.countByArticleIds(ids);
      const payload: Record<string, number> = {};
      for (const id of ids) {
        payload[id] = counts.get(id) ?? 0;
      }
      return payload;
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/articles/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const searchParams = qp(ctx);
      const kb = searchParams.get("kb") || undefined;
      const article = await repos.articles.getById(params.id, kb);
      if (!article) {
        return notFound();
      }
      // The reader waits on this request, so everything that does not depend on
      // another result is fetched at once; only the data-source link (needs the
      // source references) and the comment count (needs the comments mode) run
      // after.
      const [
        parentSlug,
        nav,
        attachments,
        source_references,
        effective,
        effective_comments_mode,
        effective_cover,
      ] = await Promise.all([
        article.parent_article_id
          ? repos.articles.getSlugById(article.parent_article_id)
          : Promise.resolve(null),
        repos.articles.getNavigationContext(article.id),
        repos.attachments.listByArticle(article.id),
        repos.source_references.listByArticle(article.id),
        resolveKbTemplateForArticle(repos, article),
        resolveKbEffectiveCommentsModeForArticle(repos, article),
        resolveKbInheritedCoverForArticle(repos, article),
      ]);
      if (parentSlug) {
        article.parent_article_slug = parentSlug;
      }
      if (nav) {
        article.parent_chain = nav.parent_chain;
        article.prev_sibling = nav.prev;
        article.next_sibling = nav.next;
        if (nav.prev_to_hub) {
          article.prev_to_kb_hub = true;
        }
      }
      const [kb_data_source, comment_count] = await Promise.all([
        resolveKbArticleDataSourceLink(repos, article, source_references),
        effective_comments_mode === "none"
          ? Promise.resolve(0)
          : repos.article_comments.countByArticle(article.id),
      ]);
      return {
        ...article,
        effective_comments_mode,
        effective_cover,
        comment_count,
        effective_template: effective.template,
        attachments,
        kb_data_source,
        source_references,
      };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/articles/:id/comments",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const article = await repos.articles.getById(params.id);
      if (!article) {
        return notFound();
      }
      const mode = await resolveKbEffectiveCommentsModeForArticle(
        repos,
        article
      );
      if (mode === "none") {
        return jsonError(403, "comments_disabled", "Comments are disabled");
      }
      return repos.article_comments.listByArticle(article.id);
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/articles/:id/comments",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const article = await repos.articles.getById(params.id);
      if (!article) {
        return notFound();
      }
      if (article.locked_at) {
        return conflict("Article is locked");
      }
      const mode = await resolveKbEffectiveCommentsModeForArticle(
        repos,
        article
      );
      if (mode !== "enabled") {
        return jsonError(403, "comments_closed", "Comments are closed");
      }
      const body = articleCommentCreateSchema.parse(
        await readRouteJsonBody(ctx)
      );
      const comment = await repos.article_comments.create(
        article.id,
        body.content,
        actorUserIdFromAuth(ctx.auth)
      );
      return created(comment);
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/kb/article-comments/:commentId",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { commentId: string };
      const existing = await repos.article_comments.getById(params.commentId);
      if (!existing) {
        return notFound();
      }
      const principalId = ctx.auth?.principalId ?? null;
      if (!principalId || existing.created_by !== principalId) {
        return jsonError(403, "forbidden", "Not allowed to edit this comment");
      }
      const article = await repos.articles.getById(existing.article_id);
      if (!article) {
        return notFound();
      }
      const mode = await resolveKbEffectiveCommentsModeForArticle(
        repos,
        article
      );
      if (mode !== "enabled") {
        return jsonError(403, "comments_closed", "Comments are closed");
      }
      const body = articleCommentUpdateSchema.parse(
        await readRouteJsonBody(ctx)
      );
      const updated = await repos.article_comments.update(
        params.commentId,
        body.content
      );
      if (!updated) {
        return notFound();
      }
      return updated;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/article-comments/:commentId",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { commentId: string };
      const existing = await repos.article_comments.getById(params.commentId);
      if (!existing) {
        return notFound();
      }
      const principalId = ctx.auth?.principalId ?? null;
      if (!principalId || existing.created_by !== principalId) {
        return jsonError(
          403,
          "forbidden",
          "Not allowed to delete this comment"
        );
      }
      await repos.article_comments.delete(params.commentId);
      return null;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/articles/:id/refresh-metadata",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const article = await repos.articles.getById(params.id);
      if (!article) {
        return notFound();
      }
      try {
        return await refreshKbArticleMetadata(repos, article, {
          principalId: ctx.auth?.principalId ?? null,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Refresh metadata failed";
        if (message === "Article is locked") {
          return conflict(message);
        }
        return jsonError(503, "refresh_metadata_failed", message);
      }
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/articles/generate-summary",
    handler: async (ctx) => {
      const parsed = kbArticleGenerateSummarySchema.safeParse(
        parseBody(ctx.body)
      );
      if (!parsed.success) {
        return jsonError(400, "invalid_body", parsed.error.message);
      }
      try {
        const summary = await generateKbArticleSummary(parsed.data);
        return { summary };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Generate summary failed";
        return jsonError(503, "generate_summary_failed", message);
      }
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/articles/:id/versions",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const article = await repos.articles.getById(params.id);
      if (!article) {
        return notFound();
      }
      const items = await repos.versions.listArticleVersions(article.id);
      return { data: items };
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/articles/:id/versions/:version",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string; version: string };
      const article = await repos.articles.getById(params.id);
      if (!article) {
        return notFound();
      }
      const version = Number.parseInt(params.version, 10);
      if (!Number.isFinite(version) || version < 1) {
        return badRequest("Invalid version");
      }
      const row = await repos.versions.getArticleVersion(article.id, version);
      if (!row) {
        return notFound();
      }
      return row;
    },
  });

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/articles/:id/versions/:version/restore",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string; version: string };
      const article = await repos.articles.getById(params.id);
      if (!article) {
        return notFound();
      }
      const version = Number.parseInt(params.version, 10);
      if (!Number.isFinite(version) || version < 1) {
        return badRequest("Invalid version");
      }
      try {
        const restored = await repos.articles.restoreFromVersion(
          article.id,
          version,
          ctx.auth ? { principalId: ctx.auth.principalId } : null
        );
        if (!restored) {
          return notFound();
        }
        return restored;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Restore failed";
        if (message.includes("locked")) {
          return badRequest(message);
        }
        throw error;
      }
    },
  });

  api.registerHttpRoute({
    method: "get",
    path: "/api/kb/articles/:id/export.pdf",
    responseMode: "binary",
    responses: {
      200: { description: "PDF export" },
      404: { description: "Article not found" },
      502: { description: "PDF generation failed" },
      503: { description: "PDF export not configured" },
    },
    summary: "Export article as PDF (Gotenberg)",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      if (!isGotenbergHtmlToPdfConfigured()) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "pdf_export_unavailable",
            message: "GOTENBERG_URL is not configured",
          }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          }
        );
      }
      const article = await repos.articles.getById(params.id);
      if (!article) {
        return notFound();
      }
      const kb = await repos.kb.getById(article.kb_id);
      const html = buildArticlePdfHtml(article, kb);
      let pdf: Uint8Array;
      try {
        pdf = await convertHtmlToPdf(html);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error("Article PDF export failed", {
          articleId: params.id,
          error: msg,
        });
        return new Response(
          JSON.stringify({
            ok: false,
            error: "pdf_generation_failed",
            message: msg,
          }),
          {
            status: 502,
            headers: { "content-type": "application/json" },
          }
        );
      }
      const filename = `${safeArticleExportBasename(article)}.pdf`;
      const pdfCopy = new Uint8Array(pdf.byteLength);
      pdfCopy.set(pdf);
      return new Response(new Blob([pdfCopy], { type: "application/pdf" }), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    },
  });

  api.registerHttpRoute({
    method: "put",
    path: "/api/kb/articles/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const articleDetails = await repos.articles.getById(params.id);
      if (!articleDetails) {
        return notFound();
      }
      const rawPatch = await ctx.request.json().catch(() => ({}));
      // Filter by the RAW body's keys: `.partial()` keeps `.default()` firing,
      // so the parsed patch invents status/sort_order/questions for renames.
      const { tag_ids, ...rest } = onlyRequestedKeys(
        rawPatch,
        articleUpdateSchema.parse(rawPatch)
      );
      let article: Awaited<ReturnType<typeof repos.articles.update>>;
      try {
        article = await repos.articles.update(
          articleDetails.id,
          rest,
          tag_ids,
          ctx.auth ? { principalId: ctx.auth.principalId } : null
        );
      } catch (e) {
        if (e instanceof Error && e.message === "Article is locked") {
          return conflict(e.message);
        }
        throw e;
      }
      if (!article) {
        return notFound();
      }
      // DAL emits `knowledge-base.article.updated` — declarative re-index
      // refreshes the chunk embeddings.
      return article;
    },
  });

  api.registerHttpRoute({
    method: "delete",
    path: "/api/kb/articles/:id",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);
      const params = ctx.params as { id: string };
      const articleDetails = await repos.articles.getById(params.id);
      if (!articleDetails) {
        return notFound();
      }
      await repos.articles.delete(articleDetails.id);
      return null;
    },
  });
}
