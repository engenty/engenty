import { z } from "zod";
import { articleUpdateSchema } from "../../src/schema/articles.js";
import { onlyRequestedKeys } from "../../src/schema/only-requested-keys.js";
import {
  kbArticleAttachmentAddInputSchema,
  kbArticleAttachmentDeleteInputSchema,
  kbArticleAttachmentsListInputSchema,
  kbArticleCreateInputSchema,
  kbArticleDeleteInputSchema,
  kbArticleIdSchema,
  kbArticlesListInputSchema,
  kbArticleUpdateInputSchema,
  kbArticleVersionRestoreInputSchema,
  kbArticleVersionsListInputSchema,
} from "./kb-ai-gateway-schemas.js";
import {
  KB_SPACE_OWNED_COLLECTION,
  type KbGatewayServer,
  type KbGetRepo,
  kbDestructiveOp,
  kbGatewayOp,
  kbLinksFor,
  kbSpaceOwnedRecord,
  spaceIdFromKbAuth,
} from "./kb-ai-gateway-shared.js";
import {
  kbTargetRequired,
  resolveKbIdForScopedRead,
} from "./kb-operation-target.js";

export function registerKbAiGatewayArticleMethods(
  server: KbGatewayServer,
  getRepo: KbGetRepo
): void {
  server.registerOperation({
    operationId: "kb_article_get",
    summary: "Get KB article by id",
    description:
      "Fetch one Knowledge Base article by article_id, including the full article payload available to the backend. Use after kb.articles.list or knowledge-base.article.search returns an article id. The article must belong to a Knowledge Base in current_space.",
    ...kbGatewayOp(true, kbSpaceOwnedRecord("article_id")),
    inputSchema: kbArticleIdSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { article_id } = kbArticleIdSchema.parse(input ?? {});
      const article = await repos.articles.getById(article_id);
      if (!article) {
        return { error: "Article not found" };
      }
      return {
        article: {
          ...article,
          link: (await kbLinksFor(repos, article.kb_id))?.article(article.id),
        },
      };
    },
  });

  server.registerOperation({
    operationId: "kb_articles_list",
    summary: "List KB articles (paginated summary rows)",
    description:
      "List article summary rows from a Knowledge Base in current_space. Use this when the user asks for all articles, articles in a specific KB, or an article directory. Supports kb_id, page_size, status, and optional text/full-text search filters. Never fall back to the tenant default KB when a Space or current KB is known.",
    ...kbGatewayOp(true, KB_SPACE_OWNED_COLLECTION),
    inputSchema: kbArticlesListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbArticlesListInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(
        repos,
        params.kb_id,
        spaceIdFromKbAuth(ctx.auth, input)
      );
      if (!kbId) {
        return kbTargetRequired(
          repos,
          spaceIdFromKbAuth(ctx.auth, input),
          params.kb_id
        );
      }
      const result = await repos.articles.listPaginated({
        kb_id: kbId,
        page: 1,
        page_size: params.page_size,
        search: params.search,
        search_fts: params.search_fts,
        status: params.status,
        ...(params.category_id ? { category_id: params.category_id } : {}),
      });
      const links = await kbLinksFor(repos, kbId);
      return {
        articles: result.data.map((a) => ({
          // `category_id` and `parent_article_id` are STRUCTURE, not detail:
          // without them a caller cannot say where an article belongs, and the
          // space Data tree would have to fetch every article in full to build
          // one folder (PLAN-space-data.md Phase K).
          category_id: a.category_id,
          id: a.id,
          link: links?.article(a.id),
          parent_article_id: a.parent_article_id,
          slug: a.slug,
          status: a.status,
          summary: a.summary,
          title: a.title,
          updated_at: a.updated_at,
        })),
        total: result.total,
      };
    },
  });

  server.registerOperation({
    operationId: "kb_article_update",
    summary: "Patch a KB article (partial update)",
    description:
      "Patch an existing Knowledge Base article by article_id. Use for edits to title, summary, content, status, tags, metadata, or other article fields. Embedding/index refresh is handled automatically via the `knowledge-base.article.updated` event.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("article_id")),
    inputSchema: kbArticleUpdateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { article_id, patch } = kbArticleUpdateInputSchema.parse(
        input ?? {}
      );
      // The RAW patch, not the parsed one: `kbArticleUpdateInputSchema` already
      // ran `articleUpdateSchema` over it, so by the time `patch` exists the
      // invented defaults are indistinguishable from fields the caller sent.
      const { tag_ids, ...rest } = onlyRequestedKeys(
        (input as { patch?: unknown } | null)?.patch,
        articleUpdateSchema.parse(patch)
      );
      let article: Awaited<ReturnType<typeof repos.articles.update>>;
      try {
        article = await repos.articles.update(
          article_id,
          rest,
          tag_ids,
          ctx.auth ? { principalId: ctx.auth.principalId } : null
        );
      } catch (e) {
        if (e instanceof Error && e.message === "Article is locked") {
          return { error: e.message };
        }
        throw e;
      }
      if (!article) {
        return { error: "Article not found" };
      }
      return {
        article: {
          ...article,
          link: (await kbLinksFor(repos, article.kb_id))?.article(article.id),
        },
      };
    },
  });

  server.registerOperation({
    operationId: "kb_article_create",
    summary: "Create a KB article draft",
    description:
      "Create a new Knowledge Base article draft or published article in current_space. Pass kb_id for the target Knowledge Base when known; never fall back to the tenant default when a Space or current KB is known.",
    ...kbGatewayOp(false, KB_SPACE_OWNED_COLLECTION),
    inputSchema: kbArticleCreateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbArticleCreateInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(
        repos,
        params.kb_id,
        spaceIdFromKbAuth(ctx.auth, input)
      );
      if (!kbId) {
        return kbTargetRequired(
          repos,
          spaceIdFromKbAuth(ctx.auth, input),
          params.kb_id
        );
      }
      const slug = params.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const article = await repos.articles.create(
        {
          // Omitted category resolves to the KB's mandatory General category.
          ...(params.category_id === undefined
            ? {}
            : { category_id: params.category_id }),
          content_json: null,
          content_markdown: params.content,
          kb_id: kbId,
          original_document_name: null,
          original_document_url: null,
          parent_article_id: params.parent_article_id ?? null,
          questions_answered: [],
          slug,
          sort_order: 0,
          status: params.status,
          summary: params.summary?.trim() || null,
          title: params.title,
        },
        // Tag links ride as the DAL's second argument, not an input field.
        params.tag_ids
      );
      return {
        article_id: article.id,
        link: (await kbLinksFor(repos, kbId))?.article(article.id),
        title: article.title,
      };
    },
  });

  server.registerOperation({
    operationId: "kb_article_versions_list",
    summary: "List version history of an article",
    description:
      "Get past edits, revision details, and author timestamps for a specific article.",
    ...kbGatewayOp(true, kbSpaceOwnedRecord("article_id")),
    inputSchema: kbArticleVersionsListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { article_id } = kbArticleVersionsListInputSchema.parse(
        input ?? {}
      );
      const list = await repos.versions.listArticleVersions(article_id);
      return { versions: list };
    },
  });

  server.registerOperation({
    operationId: "kb_article_version_restore",
    summary: "Restore article to a past version",
    description:
      "Revert article content and metadata back to an older version.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("article_id")),
    inputSchema: kbArticleVersionRestoreInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { article_id, version_id } =
        kbArticleVersionRestoreInputSchema.parse(input ?? {});
      const version = Number.parseInt(version_id, 10);
      if (!Number.isFinite(version) || version < 1) {
        return { error: "Invalid version" };
      }
      const restored = await repos.articles.restoreFromVersion(
        article_id,
        version,
        ctx.auth ? { principalId: ctx.auth.principalId } : null
      );
      return { article: restored };
    },
  });

  server.registerOperation({
    operationId: "kb_article_delete",
    summary: "Delete a KB article permanently",
    description:
      "Permanently delete a Knowledge Base article. Destructive and not recoverable from the UI — prefer kb_article_update with status 'draft' (unpublish) when the content may still be needed.",
    ...kbDestructiveOp(kbSpaceOwnedRecord("article_id")),
    inputSchema: kbArticleDeleteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { article_id } = kbArticleDeleteInputSchema.parse(input ?? {});
      const ok = await repos.articles.delete(article_id);
      return ok ? { deleted: article_id } : { error: "Article not found" };
    },
  });

  server.registerOperation({
    operationId: "kb_article_attachments_list",
    summary: "List attachments linked to an article",
    description:
      "List filenames, sizes, and file types attached to a specific article.",
    ...kbGatewayOp(true, kbSpaceOwnedRecord("article_id")),
    inputSchema: kbArticleAttachmentsListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { article_id } = kbArticleAttachmentsListInputSchema.parse(
        input ?? {}
      );
      const list = await repos.attachments.listByArticle(article_id);
      return { attachments: list };
    },
  });

  server.registerOperation({
    operationId: "kb_article_attachment_add",
    summary: "Link an uploaded attachment to an article",
    description:
      "Attach an already uploaded file bucket reference object to a KB article.",
    ...kbGatewayOp(false, kbSpaceOwnedRecord("article_id")),
    inputSchema: kbArticleAttachmentAddInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbArticleAttachmentAddInputSchema.parse(input ?? {});
      const attachment = await repos.attachments.create({
        article_id: params.article_id,
        filename: params.filename,
        storage_key: params.storage_key,
        mime_type: params.mime_type ?? "application/octet-stream",
        size_bytes: params.size_bytes ?? 0,
      });
      return { attachment };
    },
  });

  server.registerOperation({
    operationId: "kb_article_attachment_delete",
    summary: "Delete an article attachment link",
    description: "Remove the attachment link from the article.",
    ...kbDestructiveOp(kbSpaceOwnedRecord("attachment_id")),
    inputSchema: kbArticleAttachmentDeleteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { attachment_id } = kbArticleAttachmentDeleteInputSchema.parse(
        input ?? {}
      );
      const success = await repos.attachments.delete(attachment_id);
      return { success };
    },
  });
}
