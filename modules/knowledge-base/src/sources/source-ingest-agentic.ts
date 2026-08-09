/**
 * Agentic ingestion: uses an LLM agent with direct repo tools to autonomously
 * create and update KB articles/categories according to user instructions.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
} from "@engenty/ai-core";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import type { KbRepoFactory } from "../dal/contracts.js";

export interface ResolvedSourceItem {
  content_markdown: string;
  inbox_id: string | null;
  source_url: string | null;
  title: string;
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function readSkillMarkdown(): string {
  return readFileSync(
    join(__dirname, "../../ai/skills/kb-agentic-source-ingest/SKILL.md"),
    "utf-8"
  );
}

export interface AgenticIngestOptions {
  actorPrincipalId?: string | null;
  category_id?: string | null;
  instructions: string;
  items: ResolvedSourceItem[];
  kbId: string;
  parent_article_id?: string | null;
}

export interface AgenticIngestResult {
  article_ids: string[];
  categories_created: number;
  ingested_items: number;
  strategy: "agentic";
  summary: string;
}

function buildSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80)
      .replace(/^-|-$/g, "") || `article-${Date.now()}`
  );
}

export async function ingestKbSourceAgentic(
  repos: KbRepoFactory,
  opts: AgenticIngestOptions
): Promise<AgenticIngestResult> {
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("AI Gateway API key is required for agentic ingestion.");
  }

  const {
    kbId,
    items,
    instructions,
    category_id,
    parent_article_id,
    actorPrincipalId,
  } = opts;
  const actor = actorPrincipalId ? { principalId: actorPrincipalId } : null;

  const createdArticleIds: string[] = [];
  let categoriesCreated = 0;

  const agentTools = {
    kb_list_items: tool({
      description: "List all source items available for ingestion.",
      inputSchema: z.object({}),
      execute: async () => ({
        items: items.map((item, idx) => ({
          index: idx,
          title: item.title,
          source_url: item.source_url ?? null,
          content_preview: item.content_markdown.slice(0, 300),
        })),
      }),
    }),

    kb_get_item: tool({
      description: "Get the full content of a specific source item by index.",
      inputSchema: z.object({ index: z.number().int().min(0) }),
      execute: async ({ index }) => {
        const item = items[index];
        if (!item) {
          return { error: "Item not found" };
        }
        return {
          index,
          title: item.title,
          source_url: item.source_url ?? null,
          content_markdown: item.content_markdown,
        };
      },
    }),

    kb_list_categories: tool({
      description: "List existing KB categories.",
      inputSchema: z.object({}),
      execute: async () => {
        const cats = await repos.categories.list(kbId);
        return {
          categories: cats.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            parent_id: c.parent_id ?? null,
            is_default: c.is_default,
          })),
        };
      },
    }),

    kb_create_category: tool({
      description: "Create a new KB category.",
      inputSchema: z.object({
        name: z.string(),
        slug: z.string().optional(),
        parent_id: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
      execute: async ({ name, slug, parent_id, description }) => {
        const cat = await repos.categories.create({
          description: description ?? null,
          kb_id: kbId,
          name,
          parent_id: parent_id ?? null,
          slug: slug ?? buildSlug(name),
          sort_order: 0,
        });
        categoriesCreated += 1;
        return { id: cat.id, name: cat.name, slug: cat.slug };
      },
    }),

    kb_find_article: tool({
      description:
        "Find an existing KB article by source URL or title. Use before kb_create_article to detect duplicates.",
      inputSchema: z.object({
        source_url: z.string().optional(),
        title: z.string().optional(),
      }),
      execute: async ({ source_url, title }) => {
        if (source_url) {
          const article = await repos.articles.getByOriginalDocumentUrl(
            kbId,
            source_url
          );
          if (article) {
            return {
              found: true,
              article: {
                id: article.id,
                title: article.title,
                status: article.status,
                original_document_url: article.original_document_url ?? null,
                link: `[${article.title}](${article.id})`,
              },
            };
          }
        }
        if (title) {
          const result = await repos.articles.listPaginated({
            kb_id: kbId,
            search: title,
            page_size: 5,
          });
          if (result.data.length > 0) {
            return {
              found: true,
              articles: result.data.map((a) => ({
                id: a.id,
                title: a.title,
                status: a.status,
                original_document_url: a.original_document_url ?? null,
                link: `[${a.title}](${a.id})`,
              })),
            };
          }
        }
        return { found: false };
      },
    }),

    kb_list_articles: tool({
      description: "List existing KB articles.",
      inputSchema: z.object({
        search: z.string().optional(),
        page: z.number().int().min(1).optional(),
        page_size: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ search, page, page_size }) => {
        const result = await repos.articles.listPaginated({
          kb_id: kbId,
          search,
          page: page ?? 1,
          page_size: page_size ?? 20,
        });
        return {
          articles: result.data.map((a) => ({
            id: a.id,
            title: a.title,
            status: a.status,
            original_document_url: a.original_document_url ?? null,
            category_id: a.category_id ?? null,
            link: `[${a.title}](${a.id})`,
          })),
          total: result.total,
        };
      },
    }),

    kb_get_article: tool({
      description: "Get full content of an existing article.",
      inputSchema: z.object({ article_id: z.string() }),
      execute: async ({ article_id }) => {
        const article = await repos.articles.getById(article_id);
        if (!article) {
          return { error: "Article not found" };
        }
        return {
          id: article.id,
          title: article.title,
          status: article.status,
          content_markdown: article.content_markdown ?? "",
          category_id: article.category_id ?? null,
          original_document_url: article.original_document_url ?? null,
          link: `[${article.title}](${article.id})`,
        };
      },
    }),

    kb_create_article: tool({
      description:
        "Create a new KB article as draft. If an article with the same original_document_url already exists, returns it instead of creating a duplicate.",
      inputSchema: z.object({
        title: z.string(),
        content_markdown: z.string(),
        category_id: z.string().nullable().optional(),
        parent_article_id: z.string().nullable().optional(),
        original_document_url: z.string().nullable().optional(),
        summary: z.string().nullable().optional(),
      }),
      execute: async (input) => {
        // Dedup guard: return existing article if URL already ingested
        if (input.original_document_url) {
          const existing = await repos.articles.getByOriginalDocumentUrl(
            kbId,
            input.original_document_url
          );
          if (existing) {
            if (!createdArticleIds.includes(existing.id)) {
              createdArticleIds.push(existing.id);
            }
            return {
              existing: true,
              id: existing.id,
              title: existing.title,
              status: existing.status,
              link: `[${existing.title}](${existing.id})`,
            };
          }
        }
        const article = await repos.articles.create(
          {
            category_id: input.category_id ?? category_id ?? null,
            content_json: null,
            content_markdown: input.content_markdown,
            kb_id: kbId,
            original_document_name: null,
            original_document_url: input.original_document_url ?? null,
            parent_article_id:
              input.parent_article_id ?? parent_article_id ?? null,
            questions_answered: [],
            slug: buildSlug(input.title),
            sort_order: 0,
            status: "draft",
            summary: input.summary ?? null,
            title: input.title,
          },
          [],
          actor
        );
        createdArticleIds.push(article.id);
        return {
          id: article.id,
          title: article.title,
          status: article.status,
          link: `[${article.title}](${article.id})`,
        };
      },
    }),

    kb_update_article: tool({
      description: "Update an existing KB article.",
      inputSchema: z.object({
        article_id: z.string(),
        title: z.string().optional(),
        content_markdown: z.string().optional(),
        category_id: z.string().nullable().optional(),
        parent_article_id: z.string().nullable().optional(),
        summary: z.string().nullable().optional(),
      }),
      execute: async ({ article_id, ...patch }) => {
        const updated = await repos.articles.update(
          article_id,
          patch,
          [],
          actor
        );
        if (!updated) {
          return { error: "Article not found or update failed" };
        }
        if (!createdArticleIds.includes(article_id)) {
          createdArticleIds.push(article_id);
        }
        return {
          id: updated.id,
          title: updated.title,
          status: updated.status,
          link: `[${updated.title}](${updated.id})`,
        };
      },
    }),
  };

  const skillMarkdown = readSkillMarkdown();
  const itemSummary = items
    .slice(0, 80)
    .map(
      (item, idx) => `${idx}. ${item.title} — ${item.source_url ?? "no url"}`
    )
    .join("\n");

  const systemPrompt = [
    skillMarkdown,
    "",
    "## Runtime context",
    `- KB ID: ${kbId}`,
    `- Default category ID: ${category_id ?? "(use kb default)"}`,
    `- Default parent article ID: ${parent_article_id ?? "(none)"}`,
    `- Source items available: ${items.length}`,
  ].join("\n");

  const userPrompt = [
    "## User instructions",
    instructions ||
      "Create one draft article per source item in the default category.",
    "",
    "## Source items",
    itemSummary,
    "",
    "Execute the ingestion now. Use `kb_get_item` to read full content before creating each article.",
    "Report your results at the end.",
  ].join("\n");

  const result = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    instructions: systemPrompt,
    prompt: userPrompt,
    tools: agentTools,
    stopWhen: isStepCount(40),
    maxRetries: 1,
  });

  return {
    article_ids: createdArticleIds,
    categories_created: categoriesCreated,
    ingested_items: createdArticleIds.length,
    strategy: "agentic",
    summary: result.text.slice(0, 1000),
  };
}
