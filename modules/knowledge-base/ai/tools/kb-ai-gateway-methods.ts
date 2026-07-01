/**
 * Server operations for Knowledge Base AI tools (copilot / orchestrator).
 * Core currently bridges these operations for gateway-style AI invocation.
 */

import {
  assertSourceAdapterRunReady,
  computeDocumentSourceNextRunAt,
  defaultDocumentSourceAdapterRegistry,
} from "@engenty/document-sources";
import type {
  PluginAuthContext,
  PluginEventsApi,
  PluginServerApi,
} from "@engenty/plugin-sdk";
import { ingestUrlToMarkdown } from "@engenty/web-ingest";
import { z } from "zod";
import { executeInboxPromote } from "../../src/api/kb-inbox-promote.js";
import { executeInboxPromoteBatch } from "../../src/api/kb-inbox-promote-batch.js";
import {
  bootstrapFileUploadSourceWithInbox,
  bootstrapManualSourceWithInbox,
} from "../../src/api/kb-source-create-bootstrap.js";
import { resolveKbSourceScheduleTimezone } from "../../src/api/kb-sources.js";
import type { KbRepoFactory } from "../../src/dal/contracts.js";
import { enrichKbFromSettings } from "../../src/dal/shared.js";
import { articleUpdateSchema } from "../../src/schema/articles.js";
import { inboxItemCreateSchema } from "../../src/schema/inbox.js";
import { runKbSource } from "../../src/sources/source-runner.js";
import { resolveKbIdForScopedRead } from "./kb-operation-target.js";

type KbRepos = KbRepoFactory;

export type KbGetRepo = (auth?: PluginAuthContext) => KbRepos;

const kbGatewayOp = (read: boolean) => ({
  moduleId: "knowledge-base" as const,
  riskLevel: read ? ("low" as const) : ("high" as const),
  idempotent: read,
});

import {
  kbArticleAttachmentAddInputSchema,
  kbArticleAttachmentDeleteInputSchema,
  kbArticleAttachmentsListInputSchema,
  kbArticleCreateInputSchema,
  kbArticleIdSchema,
  kbArticlesListInputSchema,
  kbArticleUpdateInputSchema,
  kbArticleVersionRestoreInputSchema,
  kbArticleVersionsListInputSchema,
  kbCategoriesListInputSchema,
  kbCategoryCreateInputSchema,
  kbCategoryDeleteInputSchema,
  kbCategoryGetInputSchema,
  kbCategoryUpdateInputSchema,
  kbFaqCreateInputSchema,
  kbFaqDeleteInputSchema,
  kbFaqsListInputSchema,
  kbFaqUpdateInputSchema,
  kbInboxDeleteInputSchema,
  kbInboxFetchSourceInputSchema,
  kbInboxGetInputSchema,
  kbInboxPromoteBatchInputSchema,
  kbInboxPromoteInputSchema,
  kbInboxUpdateInputSchema,
  kbSourceCreateInputSchema,
  kbSourceDeleteInputSchema,
  kbSourceItemsListInputSchema,
  kbSourceRunInputSchema,
  kbSourceRunsListInputSchema,
  kbSourcesListInputSchema,
  kbSourceUpdateInputSchema,
} from "./kb-ai-gateway-schemas.js";

export function registerKbAiGatewayMethods(
  server: Pick<PluginServerApi, "registerOperation" | "getStorageService">,
  getRepo: KbGetRepo,
  events: PluginEventsApi
): void {
  server.registerOperation({
    operationId: "kb_list",
    summary: "List knowledge bases",
    description:
      "List available Knowledge Bases in the current tenant/scope. Use this first when the user asks which knowledge bases exist, wants to choose a KB, or needs a kb_id before listing articles, FAQs, sources, or running KB search.",
    ...kbGatewayOp(true),
    inputSchema: z.object({}),
    outputSchema: z.unknown(),
    handler: async (_input, ctx) => {
      const repos = getRepo(ctx.auth);
      const [kbs, settings] = await Promise.all([
        repos.kb.list(),
        repos.settings.get(),
      ]);
      return {
        knowledge_bases: kbs.map((kb) =>
          enrichKbFromSettings(
            kb,
            settings.kb_display_by_id[kb.id],
            settings.kb_page_layout_by_id[kb.id]
          )
        ),
        total: kbs.length,
      };
    },
  });

  server.registerOperation({
    operationId: "kb_article_get",
    summary: "Get KB article by id",
    description:
      "Fetch one Knowledge Base article by article_id, including the full article payload available to the backend. Use after kb.articles.list or knowledge-base.article.search returns an article id.",
    ...kbGatewayOp(true),
    inputSchema: kbArticleIdSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { article_id } = kbArticleIdSchema.parse(input ?? {});
      const article = await repos.articles.getById(article_id);
      if (!article) {
        return { error: "Article not found" };
      }
      return { article };
    },
  });

  server.registerOperation({
    operationId: "kb_articles_list",
    summary: "List KB articles (paginated summary rows)",
    description:
      "List article summary rows from a Knowledge Base. Use this when the user asks for all articles, articles in a specific KB, or an article directory. Supports kb_id, page_size, status, and optional text/full-text search filters.",
    ...kbGatewayOp(true),
    inputSchema: kbArticlesListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbArticlesListInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(repos, params.kb_id);
      if (!kbId) {
        return { error: "No knowledge bases found" };
      }
      const result = await repos.articles.listPaginated({
        kb_id: kbId,
        page: 1,
        page_size: params.page_size,
        search: params.search,
        search_fts: params.search_fts,
        status: params.status,
      });
      return {
        articles: result.data.map((a) => ({
          id: a.id,
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
    operationId: "kb_faqs_list",
    summary: "List KB FAQs",
    description:
      "List FAQ entries for a Knowledge Base. Use this when the user asks for questions and answers, FAQs, or help-center FAQ content; pass kb_id for a specific Knowledge Base.",
    ...kbGatewayOp(true),
    inputSchema: kbFaqsListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbFaqsListInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(repos, params.kb_id);
      if (!kbId) {
        return { error: "No knowledge bases found" };
      }
      const result = await repos.faqs.listPaginated({
        kb_id: kbId,
        page: 1,
        page_size: params.page_size,
        search: params.search,
      });
      return {
        faqs: result.data.map((f) => ({
          answer: f.answer_markdown,
          id: f.id,
          question: f.question,
          status: f.status,
        })),
        total: result.total,
      };
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_get",
    summary: "Get a KB inbox capture row by id",
    description:
      "Fetch one Knowledge Base inbox/source capture row by inbox_id. Use for inspecting a captured source item before triage, promotion, or update.",
    ...kbGatewayOp(true),
    inputSchema: kbInboxGetInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id } = kbInboxGetInputSchema.parse(input ?? {});
      const item = await repos.inbox.getById(inbox_id);
      if (!item) {
        return { error: "Inbox item not found" };
      }
      return { item };
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_create",
    summary:
      "Create a KB inbox capture row (same contract as POST /api/kb/inbox)",
    description:
      "Create a Knowledge Base inbox/source capture row from raw text, markdown, URL metadata, or uploaded-source metadata. This writes data and is not for read-only discovery.",
    ...kbGatewayOp(false),
    inputSchema: inboxItemCreateSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const body = inboxItemCreateSchema.parse(input ?? {});
      const principal = ctx.auth?.principalId ?? null;
      const item = await repos.inbox.create(
        {
          kb_id: body.kb_id,
          title: body.title,
          source_type: body.source_type,
          source_url: body.source_url ?? null,
          raw_markdown: body.raw_markdown ?? null,
          raw_text: body.raw_text ?? null,
          metadata: body.metadata ?? {},
          original_storage_path: body.original_storage_path ?? null,
        },
        principal
      );
      await repos.activity_log.append({
        kb_id: body.kb_id,
        event_type: "inbox.capture",
        payload: { inbox_id: item.id, source_type: item.source_type },
        actor_id: principal,
      });
      await events.modules.emit(
        "knowledge-base.inbox.item.created",
        {
          tenant_id: item.tenant_id,
          scope_id: item.scope_id,
          kb_id: item.kb_id,
          inbox_id: item.id,
          title: item.title,
          source_type: item.source_type,
        },
        {
          tenantId: item.tenant_id,
          actorId: principal ?? undefined,
          sourceModuleId: "knowledge-base",
        }
      );
      return { inbox_id: item.id, title: item.title };
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_update",
    summary: "Patch a KB inbox row (triage fields, status, raw text)",
    description:
      "Patch triage fields, status, raw text, or metadata on an existing Knowledge Base inbox/source capture row. Use only when the user wants to modify a captured source.",
    ...kbGatewayOp(false),
    inputSchema: kbInboxUpdateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id, patch } = kbInboxUpdateInputSchema.parse(input ?? {});
      const updated = await repos.inbox.update(inbox_id, patch);
      if (!updated) {
        return { error: "Inbox item not found" };
      }
      return { item: updated };
    },
  });

  server.registerOperation({
    operationId: "kb_article_update",
    summary: "Patch a KB article (partial update)",
    description:
      "Patch an existing Knowledge Base article by article_id. Use for edits to title, summary, content, status, tags, metadata, or other article fields. Embedding/index refresh is handled automatically via the `knowledge-base.article.updated` event.",
    ...kbGatewayOp(false),
    inputSchema: kbArticleUpdateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { article_id, patch } = kbArticleUpdateInputSchema.parse(
        input ?? {}
      );
      const { tag_ids, ...rest } = articleUpdateSchema.parse(patch);
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
      return { article };
    },
  });

  server.registerOperation({
    operationId: "kb_article_create",
    summary: "Create a KB article draft",
    description:
      "Create a new Knowledge Base article draft or published article. Use when the user asks to add a new article; pass kb_id for the target Knowledge Base when known.",
    ...kbGatewayOp(false),
    inputSchema: kbArticleCreateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbArticleCreateInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(repos, params.kb_id);
      if (!kbId) {
        return { error: "No knowledge bases found" };
      }
      const slug = params.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const article = await repos.articles.create({
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
        summary: null,
        title: params.title,
      });
      return { article_id: article.id, title: article.title };
    },
  });

  // A. FAQs & Categories
  server.registerOperation({
    operationId: "kb_faq_create",
    summary: "Create a KB FAQ entry",
    description: "Create a new Q&A FAQ entry in a Knowledge Base.",
    ...kbGatewayOp(false),
    inputSchema: kbFaqCreateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbFaqCreateInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(repos, params.kb_id);
      if (!kbId) {
        return { error: "No knowledge bases found" };
      }
      const { tag_ids, ...rest } = params;
      const faq = await repos.faqs.create(
        {
          ...rest,
          kb_id: kbId,
        },
        tag_ids,
        ctx.auth ? { principalId: ctx.auth.principalId } : null
      );
      return { faq_id: faq.id, question: faq.question };
    },
  });

  server.registerOperation({
    operationId: "kb_faq_update",
    summary: "Patch a KB FAQ entry",
    description: "Modify question, answer, status, sorting, or tags for a FAQ.",
    ...kbGatewayOp(false),
    inputSchema: kbFaqUpdateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { faq_id, patch } = kbFaqUpdateInputSchema.parse(input ?? {});
      const { tag_ids, ...rest } = patch;
      const faq = await repos.faqs.update(
        faq_id,
        rest,
        tag_ids,
        ctx.auth ? { principalId: ctx.auth.principalId } : null
      );
      if (!faq) {
        return { error: "FAQ not found" };
      }
      return { faq };
    },
  });

  server.registerOperation({
    operationId: "kb_faq_delete",
    summary: "Delete (soft-delete) a KB FAQ entry",
    description: "Mark a FAQ entry as deleted.",
    ...kbGatewayOp(false),
    inputSchema: kbFaqDeleteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { faq_id } = kbFaqDeleteInputSchema.parse(input ?? {});
      const ok = await repos.faqs.delete(faq_id);
      return { success: ok };
    },
  });

  server.registerOperation({
    operationId: "kb_categories_list",
    summary: "List KB Categories",
    description:
      "List all folders and categories in a specific Knowledge Base.",
    ...kbGatewayOp(true),
    inputSchema: kbCategoriesListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbCategoriesListInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(repos, params.kb_id);
      if (!kbId) {
        return { error: "No knowledge bases found" };
      }
      const list = await repos.categories.list(kbId);
      return { categories: list, total: list.length };
    },
  });

  server.registerOperation({
    operationId: "kb_category_create",
    summary: "Create a KB Category",
    description:
      "Create a new category folder under a parent or at root, with optional description, view type, template, comments mode, etc.",
    ...kbGatewayOp(false),
    inputSchema: kbCategoryCreateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbCategoryCreateInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(repos, params.kb_id);
      if (!kbId) {
        return { error: "No knowledge bases found" };
      }
      const category = await repos.categories.create({
        ...params,
        kb_id: kbId,
      });
      return { category_id: category.id, name: category.name };
    },
  });

  server.registerOperation({
    operationId: "kb_category_get",
    summary: "Get a KB Category",
    description:
      "Retrieve details, metadata settings, and layout blocks for a specific category folder.",
    ...kbGatewayOp(true),
    inputSchema: kbCategoryGetInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbCategoryGetInputSchema.parse(input ?? {});
      const category = await repos.categories.getById(params.category_id);
      if (!category) {
        return { error: "Category not found" };
      }
      return { category };
    },
  });

  server.registerOperation({
    operationId: "kb_category_update",
    summary: "Update a KB Category",
    description:
      "Update settings for an existing category (name, slug, view_type, description, template binding, comments mode, page settings).",
    ...kbGatewayOp(false),
    inputSchema: kbCategoryUpdateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbCategoryUpdateInputSchema.parse(input ?? {});
      const category = await repos.categories.getById(params.category_id);
      if (!category) {
        return { error: "Category not found" };
      }
      const updated = await repos.categories.update(
        params.category_id,
        params.patch
      );
      return { category: updated };
    },
  });

  server.registerOperation({
    operationId: "kb_category_delete",
    summary: "Delete a KB Category",
    description:
      "Delete a category. Sibling and child articles will automatically re-parent to the default general category.",
    ...kbGatewayOp(false),
    inputSchema: kbCategoryDeleteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbCategoryDeleteInputSchema.parse(input ?? {});
      const category = await repos.categories.getById(params.category_id);
      if (!category) {
        return { error: "Category not found" };
      }
      await repos.categories.delete(params.category_id);
      return { success: true };
    },
  });

  // B. Sources & Ingestion
  server.registerOperation({
    operationId: "kb_sources_list",
    summary: "List KB Sources",
    description:
      "List configured documentation/indexing sources (web urls, file uploads, manual integrations) for a KB.",
    ...kbGatewayOp(true),
    inputSchema: kbSourcesListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbSourcesListInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(repos, params.kb_id);
      if (!kbId) {
        return { error: "No knowledge bases found" };
      }
      const result = await repos.sources.listPaginated({
        ...params,
        kb_id: kbId,
      });
      return result;
    },
  });

  server.registerOperation({
    operationId: "kb_source_create",
    summary: "Create a KB Source integration",
    description:
      "Create a KB data source. adapter_id controls the fetch strategy — use 'url' for specific URLs, 'web_index' to crawl a site by following links, 'sitemap' for sitemap.xml feeds, 'firecrawl_url' for Firecrawl-backed scraping, 'manual' ONLY for hand-authored text (never for websites), 'file_upload' for Vault files. The settings object must match the chosen adapter (see inputSchema description).",
    ...kbGatewayOp(false),
    inputSchema: kbSourceCreateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbSourceCreateInputSchema.parse(input ?? {});
      const kbId = await resolveKbIdForScopedRead(repos, params.kb_id);
      if (!kbId) {
        return { error: "No knowledge bases found" };
      }
      const resolved = {
        ...params,
        kb_id: kbId,
      };

      const tz = resolveKbSourceScheduleTimezone(ctx);
      const withTz = resolved.schedule
        ? {
            ...resolved,
            schedule: { ...resolved.schedule, timezone: tz },
          }
        : resolved;

      const { ignored_item_keys, initial_index_entries, ...body } = withTz;
      const adapter = defaultDocumentSourceAdapterRegistry.get(body.adapter_id);
      const settings = adapter.settingsSchema.parse(body.settings);

      assertSourceAdapterRunReady(body.adapter_id, settings);

      const source = await repos.sources.create(
        {
          ...body,
          next_run_at: body.next_run_at ?? computeDocumentSourceNextRunAt(body),
          settings,
        },
        ctx.auth?.principalId ?? null
      );

      try {
        if (body.adapter_id === "manual") {
          await bootstrapManualSourceWithInbox(
            repos,
            source,
            settings as { body_markdown?: string; title?: string },
            ctx.auth?.principalId ?? null
          );
        } else if (body.adapter_id === "file_upload") {
          await bootstrapFileUploadSourceWithInbox(
            repos,
            source,
            settings as {
              original_filename?: string;
              storage_object_key?: string;
            },
            ctx.auth?.principalId ?? null
          );
        }
      } catch (error) {
        await repos.sources.delete(source.id);
        throw error;
      }

      const refreshed = await repos.sources.getById(source.id);
      return { source: refreshed ?? source };
    },
  });

  server.registerOperation({
    operationId: "kb_source_update",
    summary: "Update a KB Source integration",
    description:
      "Modify crawl limits, crawl timezone, sitemap settings, or schedules.",
    ...kbGatewayOp(false),
    inputSchema: kbSourceUpdateInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { source_id, patch } = kbSourceUpdateInputSchema.parse(input ?? {});
      const existing = await repos.sources.getById(source_id);
      if (!existing) {
        return { error: "Source not found" };
      }

      const tz = resolveKbSourceScheduleTimezone(ctx);
      const withTz = patch.schedule
        ? {
            ...patch,
            schedule: { ...patch.schedule, timezone: tz },
          }
        : patch;

      const settings =
        withTz.settings === undefined
          ? undefined
          : defaultDocumentSourceAdapterRegistry
              .get(existing.adapter_id)
              .settingsSchema.parse(withTz.settings);

      const nextSettings = settings ?? existing.settings;
      assertSourceAdapterRunReady(existing.adapter_id, nextSettings);

      const updated = await repos.sources.update(source_id, {
        ...withTz,
        settings,
        next_run_at:
          withTz.next_run_at === undefined
            ? withTz.schedule || withTz.enabled !== undefined
              ? computeDocumentSourceNextRunAt({
                  ...existing,
                  ...withTz,
                  settings: settings ?? existing.settings,
                })
              : undefined
            : withTz.next_run_at,
      });

      if (!updated) {
        return { error: "Source not found" };
      }
      return { source: updated };
    },
  });

  server.registerOperation({
    operationId: "kb_source_delete",
    summary: "Delete a KB Source integration",
    description: "Remove a source and stop any scheduled crawl runs.",
    ...kbGatewayOp(false),
    inputSchema: kbSourceDeleteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { source_id } = kbSourceDeleteInputSchema.parse(input ?? {});
      await repos.sources.delete(source_id);
      return { success: true };
    },
  });

  server.registerOperation({
    operationId: "kb_source_run",
    summary: "Trigger a run on a KB Source",
    description: "Start a sync or web crawl run on a configured source.",
    ...kbGatewayOp(false),
    inputSchema: kbSourceRunInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { source_id, options } = kbSourceRunInputSchema.parse(input ?? {});
      const opts = options ?? {};
      const runResult = await runKbSource(repos, source_id, {
        actorPrincipalId: ctx.auth?.principalId ?? null,
        force: opts.force,
        background: opts.background,
        limit: opts.limit,
        retrieve_images: opts.retrieve_images,
        selected_item_keys: opts.selected_item_keys,
        storageService: server.getStorageService?.("files") ?? null,
        trigger: opts.trigger ?? "manual",
      });
      return runResult;
    },
  });

  server.registerOperation({
    operationId: "kb_source_runs_list",
    summary: "List runs for a KB Source",
    description:
      "Get recent ingestion/crawl executions and their outcome statuses.",
    ...kbGatewayOp(true),
    inputSchema: kbSourceRunsListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { source_id, limit } = kbSourceRunsListInputSchema.parse(
        input ?? {}
      );
      const runs = await repos.sources.listRecentRuns(source_id, limit);
      return { runs };
    },
  });

  server.registerOperation({
    operationId: "kb_source_items_list",
    summary: "List indexed items for a KB Source",
    description:
      "List details and URL locators of index keys fetched by a source.",
    ...kbGatewayOp(true),
    inputSchema: kbSourceItemsListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbSourceItemsListInputSchema.parse(input ?? {});
      const items = await repos.sources.listIndexedItemsPaginated(
        params.source_id,
        {
          page: params.page,
          page_size: params.page_size,
          search: params.search,
          status: params.status,
        }
      );
      return items;
    },
  });

  // C. Inbox Triage & Promotion
  server.registerOperation({
    operationId: "kb_inbox_promote",
    summary: "Promote an inbox capture item to article/FAQ",
    description:
      "Promote triage markdown or question text from inbox to a KB article or FAQ.",
    ...kbGatewayOp(false),
    inputSchema: kbInboxPromoteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id, body } = kbInboxPromoteInputSchema.parse(input ?? {});
      const inboxItem = await repos.inbox.getById(inbox_id);
      if (!inboxItem) {
        return { error: "Inbox item not found" };
      }
      const res = await executeInboxPromote(repos, {
        actorPrincipalId: ctx.auth?.principalId ?? "",
        body,
        inboxItem,
      });
      return res;
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_promote_batch",
    summary: "Promote an inbox item into multiple nested articles",
    description:
      "Create multiple articles structured hierarchy-wise from a single inbox row.",
    ...kbGatewayOp(false),
    inputSchema: kbInboxPromoteBatchInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id, body } = kbInboxPromoteBatchInputSchema.parse(
        input ?? {}
      );
      const inboxItem = await repos.inbox.getById(inbox_id);
      if (!inboxItem) {
        return { error: "Inbox item not found" };
      }
      const res = await executeInboxPromoteBatch(repos, {
        actorPrincipalId: ctx.auth?.principalId ?? "",
        body,
        inboxItem,
      });
      return res;
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_delete",
    summary: "Delete an inbox capture item",
    description: "Remove an item from the KB inbox completely.",
    ...kbGatewayOp(false),
    inputSchema: kbInboxDeleteInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id } = kbInboxDeleteInputSchema.parse(input ?? {});
      const ok = await repos.inbox.delete(inbox_id);
      return { success: ok };
    },
  });

  server.registerOperation({
    operationId: "kb_inbox_fetch_source",
    summary: "Ingest content from inbox source URL",
    description:
      "Trigger remote download of source URL markdown and store it inside inbox body.",
    ...kbGatewayOp(false),
    inputSchema: kbInboxFetchSourceInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { inbox_id, body } = kbInboxFetchSourceInputSchema.parse(
        input ?? {}
      );
      const opts = body ?? {};

      const existing = await repos.inbox.getById(inbox_id);
      if (!existing) {
        return { error: "Inbox item not found" };
      }
      if (existing.status === "promoted" || existing.status === "discarded") {
        return { error: "Inbox item cannot be fetched in this status" };
      }
      const sourceUrl = existing.source_url?.trim();
      if (!sourceUrl) {
        return { error: "source_url is required to fetch" };
      }
      const hasRaw =
        Boolean(existing.raw_markdown?.trim()) ||
        Boolean(existing.raw_text?.trim());
      if (hasRaw && !opts.force) {
        return {
          error: "Raw content already present; send force=true to replace",
        };
      }

      const now = new Date().toISOString();
      const baseMeta = {
        ...existing.metadata,
        last_fetch_at: now,
      };

      try {
        const result = await ingestUrlToMarkdown(sourceUrl, {
          fetchUserAgent: `EngentyKnowledgeBase/1.0 (+${process.env.ENGENTY_UI_BASE_URL?.trim() || "engenty"}; inbox URL fetch)`,
          firecrawlApiKey: process.env.FIRECRAWL_API_KEY?.trim() || undefined,
        });
        const mergedMeta = {
          ...baseMeta,
          last_fetch_content_type: result.content_type,
          last_fetch_bytes: result.bytes_read,
          last_fetch_final_url: result.final_url,
          last_fetch_provider: result.provider,
          last_fetch_error: null,
        };
        const item = await repos.inbox.update(inbox_id, {
          raw_markdown: result.markdown,
          metadata: mergedMeta,
        });
        if (!item) {
          return { error: "Inbox item not found after update" };
        }
        await repos.activity_log.append({
          kb_id: existing.kb_id,
          event_type: "inbox.fetch_source",
          payload: {
            inbox_id,
            bytes_read: result.bytes_read,
            content_type: result.content_type,
            final_url: result.final_url,
            provider: result.provider,
          },
          actor_id: ctx.auth?.principalId ?? null,
        });
        return { item };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Fetch failed";
        ctx.logger.error("Inbox fetch-source failed", { error: msg });
        const mergedMeta = {
          ...baseMeta,
          last_fetch_error: msg,
        };
        await repos.inbox.update(inbox_id, {
          metadata: mergedMeta,
        });
        return { error: msg };
      }
    },
  });

  // D. Versions & Attachments
  server.registerOperation({
    operationId: "kb_article_versions_list",
    summary: "List version history of an article",
    description:
      "Get past edits, revision details, and author timestamps for a specific article.",
    ...kbGatewayOp(true),
    inputSchema: kbArticleVersionsListInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { article_id } = kbArticleVersionsListInputSchema.parse(
        input ?? {}
      );
      const list = await repos.articles.listVersions(article_id);
      return { versions: list };
    },
  });

  server.registerOperation({
    operationId: "kb_article_version_restore",
    summary: "Restore article to a past version",
    description:
      "Revert article content and metadata back to an older version.",
    ...kbGatewayOp(false),
    inputSchema: kbArticleVersionRestoreInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const { article_id, version_id } =
        kbArticleVersionRestoreInputSchema.parse(input ?? {});
      const restored = await repos.articles.restoreVersion(
        article_id,
        version_id,
        ctx.auth ? { principalId: ctx.auth.principalId } : null
      );
      return { article: restored };
    },
  });

  server.registerOperation({
    operationId: "kb_article_attachments_list",
    summary: "List attachments linked to an article",
    description:
      "List filenames, sizes, and file types attached to a specific article.",
    ...kbGatewayOp(true),
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
    ...kbGatewayOp(false),
    inputSchema: kbArticleAttachmentAddInputSchema,
    outputSchema: z.unknown(),
    handler: async (input, ctx) => {
      const repos = getRepo(ctx.auth);
      const params = kbArticleAttachmentAddInputSchema.parse(input ?? {});
      const attachment = await repos.attachments.create({
        article_id: params.article_id,
        filename: params.filename,
        storage_key: params.storage_key,
        mime_type: params.mime_type ?? null,
        size_bytes: params.size_bytes ?? null,
      });
      return { attachment };
    },
  });

  server.registerOperation({
    operationId: "kb_article_attachment_delete",
    summary: "Delete an article attachment link",
    description: "Remove the attachment link from the article.",
    ...kbGatewayOp(false),
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
