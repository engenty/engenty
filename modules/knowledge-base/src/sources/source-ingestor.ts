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
import type {
  KbSourceIngestContentOptions,
  KbSourceIngestStrategy,
} from "../schema/sources.js";
import {
  type KbArticleTemplate,
  type KbSourceItem,
  type KbSourceItemSection,
  type KbTemplateBindingMode,
  kbTemplateHasContentStructure,
} from "../schema/types.js";
import { refreshKbArticleMetadata } from "../services/kb-article-metadata-refresh.js";
import { generateKbIngestQuestions } from "../services/kb-ingest-questions.js";
import { fillKbTemplateFromSource } from "../services/kb-template-ingest-fill.js";
import {
  extractKbTemplateMetadataFromSource,
  type KbTemplateExtractedMetadata,
} from "../services/kb-template-property-extract.js";
import { resolveKbTemplateForArticle } from "../services/kb-template-resolver.js";
import {
  buildSubPageIndexMarkdown,
  type MarkdownSubPage,
  type ResolvedIngestContentFlags,
  resolveIngestContentFlags,
  type SubPageIndexEntry,
  splitMarkdownIntoSubPages,
} from "./ingest-article-plan.js";
import { ingestKbSourceAgentic } from "./source-ingest-agentic.js";

export type { KbSourceIngestStrategy } from "../schema/sources.js";

import { MDocument } from "@mastra/rag";

/** Body section headings. English is the KB's authoring default. */
const SUMMARY_HEADING = "Summary";
const CONTENTS_HEADING = "Contents";
const QUESTIONS_HEADING = "Questions answered";
const SOURCES_HEADING = "Sources";

export interface IngestKbSourceOptions extends KbSourceIngestContentOptions {
  actorPrincipalId?: string | null;
  category_id?: string | null;
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
  /** Vault object key when the entry came from an uploaded document. */
  original_storage_path: string | null;
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

/**
 * One article's body, kept in three pieces so the sub-page split can replace
 * the middle one with an index without losing the head or the tail.
 */
interface ArticleBodyParts {
  /** Full source text; empty when the run does not include it. */
  body: string;
  /** Template structure and/or generated summary. */
  head: string;
  metadata: KbTemplateExtractedMetadata | null;
  metadataExtracted: boolean;
  questions: string[];
  summary: string | null;
  /** Questions-answered section; empty when the run does not include it. */
  tail: string;
}

/**
 * In-app link to an article. The KB slug is part of the route, so the index
 * needs it before it can link anywhere.
 */
function articleHrefFor(): (articleId: string) => string {
  return (articleId) => `/mdl/knowledge-base/${articleId}`;
}

function joinParts(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

async function buildArticleBodyParts(
  resolved: ResolvedIngestItemContent,
  template: KbArticleTemplate | null,
  flags: ResolvedIngestContentFlags,
  instructions?: string
): Promise<ArticleBodyParts> {
  const hasTemplateStructure = kbTemplateHasContentStructure(template);

  let metadata: KbTemplateExtractedMetadata | null = null;
  let metadataExtracted = false;
  let head = "";

  if (template && hasTemplateStructure) {
    const filled = await fillKbTemplateFromSource({
      instructions,
      sourceMarkdown: resolved.content_markdown,
      sourceTitle: resolved.title,
      sourceUrl: resolved.source_url,
      template,
    });
    metadata = filled;
    metadataExtracted = true;
    head = filled.content_markdown;
  } else if (template?.property_definitions.length) {
    metadata = await extractKbTemplateMetadataFromSource({
      contentMarkdown: resolved.content_markdown,
      sourceTitle: resolved.title,
      sourceUrl: resolved.source_url,
      template,
    });
    metadataExtracted = true;
  }

  let summary: string | null = metadata?.summary ?? null;
  if (flags.includeSummary) {
    const generated = await summarizeContent(resolved.content_markdown);
    summary = generated || summary;
    // With the full text present the summary needs its own heading to stay
    // readable; on its own it IS the body and a heading would be noise.
    head = joinParts(
      head,
      flags.includeFullContent
        ? `## ${SUMMARY_HEADING}\n\n${generated}`
        : generated
    );
  }

  let questions: string[] = [];
  let tail = "";
  if (flags.includeQuestions) {
    const generated = await generateKbIngestQuestions({
      contentMarkdown: resolved.content_markdown,
      headingLabel: QUESTIONS_HEADING,
      sourceTitle: resolved.title,
      sourceUrl: resolved.source_url,
    });
    questions = generated.questions;
    tail = generated.section;
  }

  return {
    body: flags.includeFullContent ? resolved.content_markdown : "",
    head,
    metadata,
    metadataExtracted,
    questions,
    summary,
    tail,
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

  const allItems = await repos.sources.listItemsPaginated(sourceId, {
    page: 1,
    page_size: 200,
  });
  const candidates = options.item_ids?.length
    ? allItems.data.filter((item) => options.item_ids?.includes(item.id))
    : allItems.data.filter((item) => item.status === "active");
  if (candidates.length === 0) {
    throw new Error("No active source items to ingest");
  }

  if (options.strategy === "agentic") {
    // Resolve content for each candidate (same path as the authored strategies)
    const resolvedItems = (
      await Promise.all(
        candidates.map((item) => resolveItemIngestContent(repos, item))
      )
    ).filter((r): r is ResolvedIngestItemContent => r !== null);
    if (resolvedItems.length === 0) {
      throw new Error(
        buildIngestFailureMessage({
          alreadyIngested: 0,
          indexedOnly: candidates.length,
          noContent: 0,
          total: candidates.length,
        })
      );
    }
    const agenticResult = await ingestKbSourceAgentic(repos, {
      actorPrincipalId: options.actorPrincipalId,
      attach_original:
        options.attach_original ?? source.ingest_config.attach_original,
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

  const resolvedCategoryId =
    options.category_id ?? source.ingest_config.category_id ?? null;
  // Placement and template binding fall back to the source's stored config;
  // the content switches are resolved once into `flags`, which is the only
  // thing downstream reads for them.
  const resolvedOptions: IngestKbSourceOptions = {
    ...options,
    category_id: resolvedCategoryId,
    template_id: options.template_id ?? source.ingest_config.template_id,
    template_mode:
      options.template_mode ?? source.ingest_config.template_mode ?? "inherit",
  };
  const template = await resolveTemplateForIngest(
    repos,
    source.kb_id,
    resolvedCategoryId,
    resolvedOptions
  );
  const flags = resolveIngestContentFlags(
    mergeContentOptions(source.ingest_config, options),
    kbTemplateHasContentStructure(template)
  );

  const kb = await repos.kb.getById(source.kb_id).catch(() => null);
  const kbSlug = kb?.slug ?? source.kb_id;

  if (options.strategy === "per_entry") {
    return ingestPerEntry(repos, source.kb_id, candidates, {
      ...resolvedOptions,
      flags,
      kbSlug,
      resolvedTemplate: template,
    });
  }

  return ingestPerSource(repos, source, candidates, {
    ...resolvedOptions,
    flags,
    kbSlug,
    resolvedTemplate: template,
  });
}

/**
 * Request flags win over the source's stored defaults, field by field — an
 * explicit `false` from the caller must not be swallowed by a stored `true`.
 */
function mergeContentOptions(
  stored: KbSourceIngestContentOptions,
  requested: KbSourceIngestContentOptions
): KbSourceIngestContentOptions {
  return {
    attach_original: requested.attach_original ?? stored.attach_original,
    include_full_content:
      requested.include_full_content ?? stored.include_full_content,
    include_questions: requested.include_questions ?? stored.include_questions,
    include_summary: requested.include_summary ?? stored.include_summary,
    split_long_articles:
      requested.split_long_articles ?? stored.split_long_articles,
  };
}

type AuthoredIngestOptions = IngestKbSourceOptions & {
  flags: ResolvedIngestContentFlags;
  /** Route segment for in-app links from an index page to its sub-pages. */
  kbSlug: string;
  resolvedTemplate?: KbArticleTemplate | null;
};

interface CreateArticleArgs {
  categoryId: string | null;
  contentMarkdown: string;
  kbId: string;
  options: AuthoredIngestOptions;
  originalDocumentName: string | null;
  originalDocumentUrl: string | null;
  parentArticleId: string | null;
  questions: string[];
  sortOrder: number;
  summary: string | null;
  title: string;
}

async function createIngestedArticle(
  repos: KbRepoFactory,
  args: CreateArticleArgs
) {
  const { options } = args;
  return repos.articles.create(
    {
      category_id: args.categoryId,
      content_json: null,
      content_markdown: args.contentMarkdown || null,
      kb_id: args.kbId,
      original_document_name: args.originalDocumentName,
      original_document_url: args.originalDocumentUrl,
      parent_article_id: args.parentArticleId,
      questions_answered: args.questions,
      slug: buildSlug(args.title),
      sort_order: args.sortOrder,
      status: "draft",
      summary: args.summary,
      template_id:
        options.template_mode === "template"
          ? (options.template_id ?? null)
          : null,
      template_mode: options.template_mode ?? "inherit",
      title: args.title,
    },
    [],
    options.actorPrincipalId ? { principalId: options.actorPrincipalId } : null
  );
}

/**
 * Provenance row for one ingested entry. Always written — the article's own
 * `original_document_*` fields are the opt-in *attachment*, while the
 * reference list is the record of where the text came from.
 */
async function recordSourceReference(
  repos: KbRepoFactory,
  articleId: string,
  resolved: ResolvedIngestItemContent
): Promise<void> {
  if (!(resolved.source_url || resolved.original_storage_path)) {
    return;
  }
  try {
    await repos.source_references.create({
      article_id: articleId,
      excerpt: null,
      faq_id: null,
      inbox_item_id: resolved.inbox_id,
      locator: null,
      original_storage_path: resolved.original_storage_path,
      source_url: resolved.source_url,
    });
  } catch {
    // Provenance is additive — never fail an ingest over it.
  }
}

function originalAttachment(
  resolved: ResolvedIngestItemContent,
  flags: ResolvedIngestContentFlags
): { name: string | null; url: string | null } {
  if (!flags.attachOriginal) {
    return { name: null, url: null };
  }
  // A vault object key is what the download button can sign; a web URL is
  // opened directly. Both are surfaced under the article's Files block, which
  // only renders when a NAME is present — hence always setting one.
  const url = resolved.original_storage_path ?? resolved.source_url;
  if (!url) {
    return { name: null, url: null };
  }
  return { name: resolved.title, url };
}

async function ingestPerEntry(
  repos: KbRepoFactory,
  kbId: string,
  items: KbSourceItem[],
  options: AuthoredIngestOptions
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

    const built = await buildArticleBodyParts(
      resolved,
      options.resolvedTemplate ?? null,
      options.flags,
      options.instructions
    );
    const title = built.metadata?.title ?? resolved.title;
    const attachment = originalAttachment(resolved, options.flags);
    const subPages = options.flags.splitLongArticles
      ? splitMarkdownIntoSubPages(built.body)
      : null;

    const article = await createIngestedArticle(repos, {
      categoryId: options.category_id ?? null,
      contentMarkdown: subPages
        ? joinParts(
            built.head,
            buildSubPageIndexMarkdown(
              subPages.intro,
              subPages.pages,
              CONTENTS_HEADING
            ),
            built.tail
          )
        : joinParts(built.head, built.body, built.tail),
      kbId,
      options,
      originalDocumentName: attachment.name,
      originalDocumentUrl: attachment.url,
      parentArticleId: options.parent_article_id ?? null,
      questions: built.questions,
      sortOrder: 0,
      summary: built.summary,
      title,
    });
    articleIds.push(article.id);
    await recordSourceReference(repos, article.id, resolved);

    if (subPages) {
      const childIds = await createSubPages(repos, {
        kbId,
        options,
        pages: subPages.pages,
        parentArticleId: article.id,
        resolved,
      });
      articleIds.push(...childIds);
      await linkIndexPage(repos, {
        articleId: article.id,
        entries: subPages.pages.map((page, index) => ({
          articleId: childIds[index] ?? null,
          title: page.title,
        })),
        head: built.head,
        intro: subPages.intro,
        options,
        tail: built.tail,
      });
    }

    if (options.resolvedTemplate && !built.metadataExtracted) {
      await refreshKbArticleMetadata(repos, article, {
        principalId: options.actorPrincipalId ?? null,
      });
    }
    if (resolved.inbox_id) {
      await repos.inbox.update(resolved.inbox_id, { status: "promoted" });
    }
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
    strategy: "per_entry",
  };
}

/**
 * Second write of an index page, now that its sub-pages have ids and the
 * contents list can link to them.
 */
async function linkIndexPage(
  repos: KbRepoFactory,
  args: {
    articleId: string;
    entries: SubPageIndexEntry[];
    extraSection?: string;
    head: string;
    intro: string;
    options: AuthoredIngestOptions;
    tail: string;
  }
): Promise<void> {
  const contentMarkdown = joinParts(
    args.head,
    buildSubPageIndexMarkdown(
      args.intro,
      args.entries,
      CONTENTS_HEADING,
      articleHrefFor()
    ),
    args.tail,
    args.extraSection ?? ""
  );
  await repos.articles.update(
    args.articleId,
    { content_markdown: contentMarkdown },
    undefined,
    args.options.actorPrincipalId
      ? { principalId: args.options.actorPrincipalId }
      : null
  );
}

async function createSubPages(
  repos: KbRepoFactory,
  args: {
    kbId: string;
    options: AuthoredIngestOptions;
    pages: readonly MarkdownSubPage[];
    parentArticleId: string;
    resolved: ResolvedIngestItemContent;
  }
): Promise<string[]> {
  const ids: string[] = [];
  for (const [index, page] of args.pages.entries()) {
    const child = await createIngestedArticle(repos, {
      categoryId: args.options.category_id ?? null,
      contentMarkdown: page.markdown,
      kbId: args.kbId,
      options: args.options,
      // The original belongs on the index page, not on every fragment of it.
      originalDocumentName: null,
      originalDocumentUrl: null,
      parentArticleId: args.parentArticleId,
      questions: [],
      sortOrder: index + 1,
      summary: null,
      title: page.title,
    });
    ids.push(child.id);
    await recordSourceReference(repos, child.id, args.resolved);
  }
  return ids;
}

async function ingestPerSource(
  repos: KbRepoFactory,
  source: { id: string; kb_id: string; name: string },
  items: KbSourceItem[],
  options: AuthoredIngestOptions
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

  const combined = resolvedItems
    .map((resolved) => {
      const urlLine =
        options.flags.attachOriginal && resolved.source_url
          ? `\n\n> Source: ${resolved.source_url}`
          : "";
      return `## ${resolved.title}${urlLine}\n\n${resolved.content_markdown}`;
    })
    .join("\n\n---\n\n");

  const instructionNote = options.instructions?.trim()
    ? `\n\n---\n\n_Instructions: ${options.instructions.trim()}_`
    : "";

  const built = await buildArticleBodyParts(
    {
      content_markdown: combined + instructionNote,
      inbox_id: null,
      original_storage_path: null,
      source_url: null,
      title: source.name,
    },
    options.resolvedTemplate ?? null,
    options.flags,
    options.instructions
  );

  // Split at the entry boundary rather than by headings: for a merged source
  // the entries ARE the sub-pages, and deriving them is exact where a heading
  // scan would guess.
  const subPages: MarkdownSubPage[] =
    options.flags.splitLongArticles && resolvedItems.length > 1
      ? resolvedItems.map((resolved) => ({
          markdown: resolved.content_markdown,
          title: resolved.title,
        }))
      : [];

  const sourcesSection =
    options.flags.attachOriginal && subPages.length > 0
      ? buildSourcesSection(resolvedItems)
      : "";

  const title = built.metadata?.title ?? source.name;
  const article = await createIngestedArticle(repos, {
    categoryId: options.category_id ?? null,
    contentMarkdown:
      subPages.length > 0
        ? joinParts(
            built.head,
            buildSubPageIndexMarkdown("", subPages, CONTENTS_HEADING),
            built.tail,
            sourcesSection
          )
        : joinParts(built.head, built.body, built.tail),
    kbId: source.kb_id,
    options,
    originalDocumentName: null,
    originalDocumentUrl: null,
    parentArticleId: options.parent_article_id ?? null,
    questions: built.questions,
    sortOrder: 0,
    summary: built.summary,
    title,
  });

  const articleIds = [article.id];
  const indexEntries: SubPageIndexEntry[] = [];
  for (const [index, page] of subPages.entries()) {
    const resolved = resolvedItems[index] as ResolvedIngestItemContent;
    const attachment = originalAttachment(resolved, options.flags);
    const child = await createIngestedArticle(repos, {
      categoryId: options.category_id ?? null,
      contentMarkdown: page.markdown,
      kbId: source.kb_id,
      options,
      originalDocumentName: attachment.name,
      originalDocumentUrl: attachment.url,
      parentArticleId: article.id,
      questions: [],
      sortOrder: index + 1,
      summary: null,
      title: page.title,
    });
    articleIds.push(child.id);
    indexEntries.push({ articleId: child.id, title: page.title });
    await recordSourceReference(repos, child.id, resolved);
  }
  if (indexEntries.length > 0) {
    await linkIndexPage(repos, {
      articleId: article.id,
      entries: indexEntries,
      extraSection: sourcesSection,
      head: built.head,
      intro: "",
      options,
      tail: built.tail,
    });
  }

  if (options.resolvedTemplate && !built.metadataExtracted) {
    await refreshKbArticleMetadata(repos, article, {
      principalId: options.actorPrincipalId ?? null,
    });
  }

  for (const resolved of resolvedItems) {
    if (subPages.length === 0) {
      await recordSourceReference(repos, article.id, resolved);
    }
    if (resolved.inbox_id) {
      await repos.inbox.update(resolved.inbox_id, { status: "promoted" });
    }
  }

  return {
    article_ids: articleIds,
    ingested_items: resolvedItems.length,
    strategy: "per_source",
  };
}

function buildSourcesSection(
  items: readonly ResolvedIngestItemContent[]
): string {
  const links = items
    .filter((item) => item.source_url)
    .map((item) => `- [${item.title}](${item.source_url})`);
  return links.length > 0
    ? [`## ${SOURCES_HEADING}`, links.join("\n")].join("\n\n")
    : "";
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
  let originalStoragePath: string | null = null;

  if (item.inbox_item_id) {
    const inbox = await repos.inbox.getById(item.inbox_item_id);
    if (inbox && inbox.status !== "promoted" && inbox.status !== "discarded") {
      inboxTitle = inbox.title?.trim() || undefined;
      title = item.title ?? inbox.title ?? title;
      sourceUrl = item.source_url ?? inbox.source_url ?? sourceUrl;
      inboxId = inbox.id;
      originalStoragePath = inbox.original_storage_path ?? null;
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
    original_storage_path: originalStoragePath,
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
  const ordered = sections.slice().sort((a, b) => a.position - b.position);
  // Web items store provenance HTML sections next to the markdown; oversized
  // markdown is split into multiple ordered "markdown" parts. Reassemble from
  // the readable kinds only, falling back to everything for legacy items.
  const readable = ordered.filter(
    (section) => section.kind === "markdown" || section.kind === "text"
  );
  const content = (readable.length > 0 ? readable : ordered)
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
