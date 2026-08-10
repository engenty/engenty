import {
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
} from "@engenty/ai-core";
import {
  extractFirstMarkdownH1,
  isTitleUrlLike,
  pickBetterPageTitle,
  titleFromUrlPath,
} from "@engenty/web-ingest";
import { generateText } from "ai";
import type { KbRepoFactory } from "../dal/contracts.js";
import type { KbSourceIngestStrategy } from "../schema/sources.js";
import {
  type KbArticleTemplate,
  type KbSourceItem,
  type KbSourceItemSection,
  type KbTemplateBindingMode,
  type KbTemplateContentMode,
  kbTemplateHasContentStructure,
} from "../schema/types.js";
import { refreshKbArticleMetadata } from "../services/kb-article-metadata-refresh.js";
import { fillKbTemplateFromSource } from "../services/kb-template-ingest-fill.js";
import {
  extractKbTemplateMetadataFromSource,
  type KbTemplateExtractedMetadata,
} from "../services/kb-template-property-extract.js";
import { resolveKbTemplateForArticle } from "../services/kb-template-resolver.js";
import { ingestKbSourceAgentic } from "./source-ingest-agentic.js";

export type { KbSourceIngestStrategy } from "../schema/sources.js";

import { MDocument } from "@mastra/rag";

export interface IngestKbSourceOptions {
  actorPrincipalId?: string | null;
  category_id?: string | null;
  content_mode?: KbTemplateContentMode;
  instructions?: string;
  item_ids?: string[];
  parent_article_id?: string;
  strategy: KbSourceIngestStrategy;
  template_id?: string | null;
  template_mode?: KbTemplateBindingMode;
}

export interface IngestKbSourceResult {
  article_ids: string[];
  ingested_items: number;
  strategy: KbSourceIngestStrategy;
  task_id?: string;
}

interface ResolvedIngestItemContent {
  content_markdown: string;
  inbox_id: string | null;
  source_url: string | null;
  title: string;
}

async function resolveTemplateForIngest(
  repos: KbRepoFactory,
  kbId: string,
  categoryId: string | null,
  options: IngestKbSourceOptions
): Promise<KbArticleTemplate | null> {
  if (!(repos.templates && repos.categories)) {
    return null;
  }
  if (options.template_mode === "none") {
    return null;
  }
  if (options.template_mode === "template" && options.template_id) {
    return repos.templates.getById(options.template_id);
  }
  const category = categoryId
    ? await repos.categories.getById(categoryId)
    : await repos.categories.getDefaultForKb(kbId);
  const resolved = await resolveKbTemplateForArticle(repos, {
    category_id: category?.id ?? categoryId ?? "",
    template_id: null,
    template_mode: "inherit",
  });
  return resolved.template;
}

async function summarizeContent(markdown: string): Promise<string> {
  if (!readAiGatewayApiKeyFromEnv()) {
    throw new Error("AI Gateway is required to summarize ingested content.");
  }
  const { text } = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    prompt: [
      "Summarize this source content as a concise knowledge-base article body.",
      "Keep the important facts and use Markdown.",
      "",
      markdown.slice(0, 24_000),
    ].join("\n"),
  });
  return text.trim();
}

interface IngestArticleBuildResult {
  content_markdown: string;
  metadata: KbTemplateExtractedMetadata | null;
  metadataExtracted: boolean;
}

function usesTemplateStructureInContent(
  mode: KbTemplateContentMode,
  hasTemplateStructure: boolean
): boolean {
  return (
    hasTemplateStructure &&
    (mode === "template_only" ||
      mode === "template_before_full_content" ||
      mode === "template_before_summary")
  );
}

async function buildArticleContentForMode(
  resolved: ResolvedIngestItemContent,
  template: KbArticleTemplate | null,
  contentMode: KbTemplateContentMode | undefined,
  instructions?: string
): Promise<IngestArticleBuildResult> {
  const hasTemplateStructure = kbTemplateHasContentStructure(template);
  const mode =
    contentMode ??
    (hasTemplateStructure ? "template_before_full_content" : "full_content");

  if (template && usesTemplateStructureInContent(mode, hasTemplateStructure)) {
    const filled = await fillKbTemplateFromSource({
      instructions,
      sourceMarkdown: resolved.content_markdown,
      sourceTitle: resolved.title,
      sourceUrl: resolved.source_url,
      template,
    });
    if (mode === "template_only") {
      return {
        content_markdown: filled.content_markdown,
        metadata: filled,
        metadataExtracted: true,
      };
    }
    if (mode === "template_before_summary") {
      const summary = await summarizeContent(resolved.content_markdown);
      return {
        content_markdown: [filled.content_markdown, summary]
          .filter((part) => part.trim())
          .join("\n\n"),
        metadata: filled,
        metadataExtracted: true,
      };
    }
    return {
      content_markdown: [filled.content_markdown, resolved.content_markdown]
        .filter((part) => part.trim())
        .join("\n\n"),
      metadata: filled,
      metadataExtracted: true,
    };
  }

  let metadata: KbTemplateExtractedMetadata | null = null;
  if (template?.property_definitions.length) {
    metadata = await extractKbTemplateMetadataFromSource({
      contentMarkdown: resolved.content_markdown,
      sourceTitle: resolved.title,
      sourceUrl: resolved.source_url,
      template,
    });
  }

  if (mode === "summary") {
    return {
      content_markdown: await summarizeContent(resolved.content_markdown),
      metadata,
      metadataExtracted: metadata !== null,
    };
  }

  return {
    content_markdown: resolved.content_markdown,
    metadata,
    metadataExtracted: metadata !== null,
  };
}

export async function ingestKbSource(
  repos: KbRepoFactory,
  sourceId: string,
  options: IngestKbSourceOptions
): Promise<IngestKbSourceResult> {
  const source = await repos.sources.getById(sourceId);
  if (!source) {
    throw new Error("Source not found");
  }

  if (options.strategy === "agentic") {
    const allItems = await repos.sources.listItemsPaginated(sourceId, {
      page: 1,
      page_size: 200,
    });
    const candidates = options.item_ids?.length
      ? allItems.data.filter((item) => options.item_ids!.includes(item.id))
      : allItems.data.filter((item) => item.status === "active");
    if (candidates.length === 0) {
      throw new Error("No active source items to ingest");
    }
    // Resolve content for each candidate (same path as articles/summary ingestion)
    const resolvedItems = (
      await Promise.all(
        candidates.map((item) => resolveItemIngestContent(repos, item))
      )
    ).filter((r): r is ResolvedIngestItemContent => r !== null);
    if (resolvedItems.length === 0) {
      const stats = {
        alreadyIngested: 0,
        indexedOnly: candidates.length,
        noContent: 0,
        total: candidates.length,
      };
      throw new Error(buildIngestFailureMessage(stats));
    }
    const agenticResult = await ingestKbSourceAgentic(repos, {
      actorPrincipalId: options.actorPrincipalId,
      category_id:
        options.category_id ?? source.ingest_config.category_id ?? null,
      instructions:
        options.instructions ?? source.ingest_config.agentic_instructions ?? "",
      items: resolvedItems,
      kbId: source.kb_id,
      parent_article_id:
        options.parent_article_id ??
        source.ingest_config.parent_article_id ??
        null,
    });
    return {
      article_ids: agenticResult.article_ids,
      ingested_items: agenticResult.ingested_items,
      strategy: "agentic",
    };
  }

  const allItems = await repos.sources.listItemsPaginated(sourceId, {
    page: 1,
    page_size: 200,
  });

  const candidates = options.item_ids?.length
    ? allItems.data.filter((item) => options.item_ids!.includes(item.id))
    : allItems.data.filter((item) => item.status === "active");

  if (candidates.length === 0) {
    throw new Error("No active source items to ingest");
  }

  const resolvedCategoryId =
    options.category_id ?? source.ingest_config.category_id ?? null;
  const template = await resolveTemplateForIngest(
    repos,
    source.kb_id,
    resolvedCategoryId,
    {
      ...options,
      template_id: options.template_id ?? source.ingest_config.template_id,
      template_mode:
        options.template_mode ??
        source.ingest_config.template_mode ??
        "inherit",
      content_mode: options.content_mode ?? source.ingest_config.content_mode,
    }
  );
  const resolvedOptions = {
    ...options,
    content_mode: options.content_mode ?? source.ingest_config.content_mode,
    template_id: options.template_id ?? source.ingest_config.template_id,
    template_mode:
      options.template_mode ?? source.ingest_config.template_mode ?? "inherit",
  };

  if (options.strategy === "articles") {
    return ingestAsArticles(repos, source.kb_id, candidates, {
      ...resolvedOptions,
      category_id: resolvedCategoryId,
      resolvedTemplate: template,
    });
  }

  return ingestAsSummary(repos, source, candidates, {
    ...resolvedOptions,
    category_id: resolvedCategoryId,
    resolvedTemplate: template,
  });
}

async function ingestAsArticles(
  repos: KbRepoFactory,
  kbId: string,
  items: KbSourceItem[],
  options: IngestKbSourceOptions & {
    resolvedTemplate?: KbArticleTemplate | null;
  }
): Promise<IngestKbSourceResult> {
  const articleIds: string[] = [];
  let skippedIndexedOnly = 0;
  let skippedAlreadyIngested = 0;
  let skippedNoContent = 0;

  for (const item of items) {
    const resolved = await resolveItemIngestContent(repos, item);
    if (!resolved) {
      const skipReason = await classifySkippedItem(repos, item);
      if (skipReason === "indexed_only") {
        skippedIndexedOnly += 1;
      } else if (skipReason === "already_ingested") {
        skippedAlreadyIngested += 1;
      } else {
        skippedNoContent += 1;
      }
      continue;
    }

    const built = await buildArticleContentForMode(
      resolved,
      options.resolvedTemplate ?? null,
      options.content_mode
    );
    const title = built.metadata?.title ?? resolved.title;
    const slug = buildSlug(title);
    const article = await repos.articles.create(
      {
        category_id: options.category_id ?? null,
        content_json: null,
        content_markdown: built.content_markdown,
        custom_properties: built.metadata?.custom_properties,
        kb_id: kbId,
        original_document_name: null,
        original_document_url: resolved.source_url,
        parent_article_id: options.parent_article_id ?? null,
        questions_answered: [],
        slug,
        sort_order: 0,
        status: "draft",
        summary: built.metadata?.summary ?? null,
        template_id:
          options.template_mode === "template"
            ? (options.template_id ?? null)
            : null,
        template_mode: options.template_mode ?? "inherit",
        title: built.metadata?.title ?? resolved.title,
      },
      [],
      options.actorPrincipalId
        ? { principalId: options.actorPrincipalId }
        : null
    );
    if (options.resolvedTemplate && !built.metadataExtracted) {
      await refreshKbArticleMetadata(repos, article, {
        principalId: options.actorPrincipalId ?? null,
      });
    }

    if (resolved.inbox_id) {
      await repos.inbox.update(resolved.inbox_id, { status: "promoted" });
    }

    articleIds.push(article.id);
  }

  if (articleIds.length === 0) {
    throw new Error(
      buildIngestFailureMessage({
        alreadyIngested: skippedAlreadyIngested,
        indexedOnly: skippedIndexedOnly,
        noContent: skippedNoContent,
        total: items.length,
      })
    );
  }

  return {
    article_ids: articleIds,
    ingested_items: articleIds.length,
    strategy: "articles",
  };
}

async function ingestAsSummary(
  repos: KbRepoFactory,
  source: { id: string; kb_id: string; name: string },
  items: KbSourceItem[],
  options: IngestKbSourceOptions & {
    resolvedTemplate?: KbArticleTemplate | null;
  }
): Promise<IngestKbSourceResult> {
  const resolvedItems = (
    await Promise.all(
      items.map((item) => resolveItemIngestContent(repos, item))
    )
  ).filter((item): item is ResolvedIngestItemContent => item !== null);

  if (resolvedItems.length === 0) {
    throw new Error(
      buildIngestFailureMessage({
        alreadyIngested: 0,
        indexedOnly: items.length,
        noContent: 0,
        total: items.length,
      })
    );
  }

  const sections = resolvedItems.map((resolved) => {
    const urlLine = resolved.source_url
      ? `\n\n> Source: ${resolved.source_url}`
      : "";
    return `## ${resolved.title}${urlLine}\n\n${resolved.content_markdown}`;
  });

  const instructionNote = options.instructions?.trim()
    ? `\n\n---\n\n_Instructions: ${options.instructions.trim()}_`
    : "";

  const content = sections.join("\n\n---\n\n") + instructionNote;
  const built = await buildArticleContentForMode(
    {
      content_markdown: content,
      inbox_id: null,
      source_url: null,
      title: source.name,
    },
    options.resolvedTemplate ?? null,
    options.content_mode === "full_content" ? "summary" : options.content_mode,
    options.instructions
  );

  const title = built.metadata?.title ?? source.name;
  const slug = buildSlug(title);
  const article = await repos.articles.create(
    {
      category_id: options.category_id ?? null,
      content_json: null,
      content_markdown: built.content_markdown || null,
      custom_properties: built.metadata?.custom_properties,
      kb_id: source.kb_id,
      original_document_name: null,
      original_document_url: null,
      parent_article_id: options.parent_article_id ?? null,
      questions_answered: [],
      slug,
      sort_order: 0,
      status: "draft",
      summary: built.metadata?.summary ?? null,
      template_id:
        options.template_mode === "template"
          ? (options.template_id ?? null)
          : null,
      template_mode: options.template_mode ?? "inherit",
      title,
    },
    [],
    options.actorPrincipalId ? { principalId: options.actorPrincipalId } : null
  );
  if (options.resolvedTemplate && !built.metadataExtracted) {
    await refreshKbArticleMetadata(repos, article, {
      principalId: options.actorPrincipalId ?? null,
    });
  }

  for (const resolved of resolvedItems) {
    if (resolved.inbox_id) {
      await repos.inbox.update(resolved.inbox_id, { status: "promoted" });
    }
  }

  return {
    article_ids: [article.id],
    ingested_items: resolvedItems.length,
    strategy: "summary",
  };
}

async function resolveItemIngestContent(
  repos: KbRepoFactory,
  item: KbSourceItem
): Promise<ResolvedIngestItemContent | null> {
  let title = item.title ?? "Untitled";
  let sourceUrl = item.source_url ?? null;
  let markdown: string | null = null;
  let inboxId: string | null = null;
  let inboxTitle: string | undefined;

  if (item.inbox_item_id) {
    const inbox = await repos.inbox.getById(item.inbox_item_id);
    if (inbox && inbox.status !== "promoted" && inbox.status !== "discarded") {
      inboxTitle = inbox.title?.trim() || undefined;
      title = item.title ?? inbox.title ?? title;
      sourceUrl = item.source_url ?? inbox.source_url ?? sourceUrl;
      inboxId = inbox.id;
      markdown = inbox.raw_markdown?.trim() ?? null;
      if (!markdown && inbox.raw_text) {
        const isHtml = /<[a-z][\s\S]*>/i.test(inbox.raw_text);
        const doc = isHtml
          ? MDocument.fromHTML(inbox.raw_text)
          : MDocument.fromText(inbox.raw_text);
        markdown = doc.getText()[0] ?? inbox.raw_text;
      }
    }
  }

  if (!markdown) {
    const sections = await repos.sources.listSourceItemSections(item.id);
    markdown = sectionsToMarkdown(sections);
  }

  if (!markdown) {
    return null;
  }

  // Format the document markdown using MDocument
  const doc = MDocument.fromMarkdown(markdown);
  markdown = doc.getText()[0] ?? markdown;

  if (isTitleUrlLike(title, sourceUrl ?? undefined)) {
    const improved = pickBetterPageTitle(
      sourceUrl ?? "",
      extractFirstMarkdownH1(markdown),
      inboxTitle,
      sourceUrl ? titleFromUrlPath(sourceUrl) : undefined
    );
    if (improved) {
      title = improved;
    }
  }

  return {
    content_markdown: markdown,
    inbox_id: inboxId,
    source_url: sourceUrl,
    title,
  };
}

function buildIngestFailureMessage(stats: {
  alreadyIngested: number;
  indexedOnly: number;
  noContent: number;
  total: number;
}): string {
  if (stats.indexedOnly > 0) {
    return `${stats.indexedOnly} of ${stats.total} item(s) are indexed but content was not fetched yet. Run Sync on the Sync tab, wait until the run completes, then try again.`;
  }
  if (stats.alreadyIngested > 0) {
    return `${stats.alreadyIngested} of ${stats.total} item(s) were already ingested into the knowledge base.`;
  }
  if (stats.noContent > 0) {
    return `${stats.noContent} of ${stats.total} item(s) have no ingestable content. Check the source entries on the Overview tab or force re-index on Sync.`;
  }
  return "No source items are ready to ingest.";
}

async function classifySkippedItem(
  repos: KbRepoFactory,
  item: KbSourceItem
): Promise<"indexed_only" | "already_ingested" | "no_content"> {
  if (!(item.content_hash || item.inbox_item_id)) {
    return "indexed_only";
  }
  if (item.inbox_item_id) {
    const inbox = await repos.inbox.getById(item.inbox_item_id);
    if (inbox?.status === "promoted" || inbox?.status === "discarded") {
      return "already_ingested";
    }
  }
  return "no_content";
}

function sectionsToMarkdown(sections: KbSourceItemSection[]): string | null {
  const content = sections
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((section) => section.content.trim())
    .filter(Boolean)
    .join("\n\n");
  return content || null;
}

function buildSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80)
      .replace(/^-|-$/g, "") || `source-${Date.now()}`
  );
}
