import { z } from "zod";
import { articleUpdateSchema } from "../../src/schema/articles.js";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
} from "../../src/schema/categories.js";
import { faqCreateSchema, faqUpdateSchema } from "../../src/schema/faqs.js";
import {
  inboxFetchSourceBodySchema,
  inboxItemUpdateSchema,
  inboxPromoteBatchBodySchema,
  inboxPromoteSchema,
} from "../../src/schema/inbox.js";
import {
  kbSourceAnalyzeBodySchema,
  kbSourceCreateSchema,
  kbSourceIngestBodySchema,
  kbSourceIngestConfigSchema,
  kbSourceIngestStrategySchema,
  kbSourceItemListQuerySchema,
  kbSourceListQuerySchema,
  kbSourceRunBodySchema,
  kbSourceUpdateSchema,
} from "../../src/schema/sources.js";

export const kbArticleIdSchema = z.object({
  article_id: z
    .string()
    .min(1)
    .describe(
      "REQUIRED: Knowledge Base article id (UUID). Extract from knowledge_base_article_search result.id or kb_articles_list result.articles[].id. Do NOT call kb_article_get without this parameter."
    ),
});

/**
 * Which knowledge bases to list.
 *
 * `space_id` exists for the space Data tree (PLAN-space-data.md Phase K): a
 * knowledge base belongs to exactly one space since Phase 6b, so a space's tree
 * must be able to ask for its own libraries rather than filtering the tenant's
 * afterwards — filtering after the fact would mean reading libraries the caller
 * only wanted to skip.
 */
export const kbListInputSchema = z.object({
  space_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Only knowledge bases belonging to this space. In a Space-bound run the runtime injects current_space; never omit that scope or list the tenant default instead."
    ),
});

/** The module's mountOperation input: the space that was just mounted. */
export const kbSpaceMountInputSchema = z.object({
  space_id: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The space the Knowledge Base module was mounted into. Omitted in a Space-bound run means current_space."
    ),
});

/** Rename / re-describe a knowledge base. */
export const kbUpdateInputSchema = z.object({
  kb_id: z.string().min(1).describe("Knowledge Base id to update."),
  name: z.string().min(1).max(256).optional().describe("New display name."),
  description: z
    .string()
    .max(2048)
    .nullable()
    .optional()
    .describe("New description; null clears it."),
});

/** Delete a KB article permanently (destructive; prefer archiving via status). */
export const kbArticleDeleteInputSchema = z.object({
  article_id: z
    .string()
    .min(1)
    .describe("Knowledge Base article id to delete permanently."),
});

export const kbTagsListInputSchema = z.object({
  kb_id: z
    .string()
    .optional()
    .describe(
      "Knowledge Base whose tags to list. Omit for the resolved current KB."
    ),
});

export const kbTagCreateInputSchema = z.object({
  kb_id: z
    .string()
    .optional()
    .describe(
      "Knowledge Base the tag belongs to. Omit for the resolved current KB."
    ),
  name: z.string().min(1).max(128).describe("Tag display name."),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe("Optional hex color, e.g. #2563eb."),
});

export const kbArticlesListInputSchema = z.object({
  category_id: z
    .string()
    .optional()
    .describe(
      "Only articles filed in this category. Omit for every article in the Knowledge Base."
    ),
  kb_id: z
    .string()
    .optional()
    .describe(
      "Target Knowledge Base id in current_space. Omit only to use the current KB in that Space — never the tenant default when a Space is known."
    ),
  // 200 is the DAL's own ceiling (`listPaginated` clamps there). The default
  // stays 10 so an agent listing articles is not handed a wall of rows; the
  // space Data tree asks for a full folder explicitly and reports `truncated`
  // when even 200 was not the whole category.
  page_size: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(10)
    .describe("Number of article summary rows to return (1–200)."),
  search: z
    .string()
    .optional()
    .describe("Optional text filter on article title or summary."),
  search_fts: z
    .boolean()
    .optional()
    .describe(
      "When true, use Postgres full-text search for search instead of simple text match."
    ),
  status: z
    .enum(["draft", "published", "archived"])
    .optional()
    .describe("Filter articles by publication status."),
});

export const kbFaqsListInputSchema = z.object({
  kb_id: z
    .string()
    .optional()
    .describe(
      "Target Knowledge Base id. Omit to list FAQs from the tenant default KB."
    ),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .default(10)
    .describe("Number of FAQ rows to return (1–30)."),
  search: z
    .string()
    .optional()
    .describe("Optional text filter on FAQ question or answer."),
});

export const kbArticleCreateInputSchema = z.object({
  category_id: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Category (folder) to file the article in. Omit for the KB's General category — but when building a structured wiki, create the category first and file directly."
    ),
  content: z.string().min(1).describe("Article body in Markdown."),
  kb_id: z
    .string()
    .optional()
    .describe(
      "Target Knowledge Base id. Omit to create in the tenant default KB."
    ),
  parent_article_id: z
    .string()
    .nullable()
    .optional()
    .describe("Optional parent article id for nested articles."),
  status: z
    .enum(["draft", "published"])
    .optional()
    .default("draft")
    .describe("Initial article status."),
  summary: z
    .string()
    .optional()
    .describe("One-paragraph summary shown in lists and search results."),
  tag_ids: z
    .array(z.string())
    .optional()
    .describe("Existing tag ids to attach (kb_tags_list / kb_tag_create)."),
  title: z.string().min(1).describe("Article title."),
});

export const kbInboxGetInputSchema = z.object({
  inbox_id: z
    .string()
    .min(1)
    .describe("Knowledge Base inbox/source capture row id."),
});

export const kbInboxUpdateInputSchema = z.object({
  inbox_id: z.string().min(1).describe("Inbox capture row id to patch."),
  patch: inboxItemUpdateSchema.describe(
    "Partial inbox fields to update (status, raw text, metadata, triage fields)."
  ),
});

export const kbArticleUpdateInputSchema = z
  .object({
    article_id: z
      .string()
      .min(1)
      .describe("Knowledge Base article id to update."),
    patch: articleUpdateSchema.describe(
      "Partial article fields to change (title, summary, content, status, tags, metadata)."
    ),
  })
  .superRefine((val, ctx) => {
    if (Object.keys(val.patch).length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "patch must include at least one field to update",
        path: ["patch"],
      });
    }
  });

// Schema helper/wrappers for FAQs
export const kbFaqCreateInputSchema = faqCreateSchema.extend({
  kb_id: z
    .string()
    .optional()
    .describe("Target KB ID. If omitted, default KB is resolved."),
});

export const kbFaqUpdateInputSchema = z.object({
  faq_id: z.string().min(1).describe("FAQ entry ID to update."),
  patch: faqUpdateSchema.describe("Partial FAQ fields to change."),
});

export const kbFaqDeleteInputSchema = z.object({
  faq_id: z.string().min(1).describe("FAQ entry ID to delete."),
});

// Schema helpers for Categories
export const kbCategoriesListInputSchema = z.object({
  kb_id: z
    .string()
    .optional()
    .describe("Target KB ID. If omitted, default KB is resolved."),
});

export const kbCategoryCreateInputSchema = categoryCreateSchema.extend({
  kb_id: z
    .string()
    .optional()
    .describe(
      "Target KB ID. Always match/pass the kb_id or target KB from context if known. If omitted, default KB is resolved."
    ),
});

export const kbCategoryGetInputSchema = z.object({
  category_id: z
    .string()
    .min(1)
    .describe("The ID of the KB category/folder to retrieve."),
});

export const kbCategoryUpdateInputSchema = z.object({
  category_id: z
    .string()
    .min(1)
    .describe("The ID of the KB category/folder to update."),
  patch: categoryUpdateSchema.describe(
    "Partial category fields to update (name, slug, view_type, description, template binding, comments mode, page settings)."
  ),
});

export const kbCategoryDeleteInputSchema = z.object({
  category_id: z
    .string()
    .min(1)
    .describe("The ID of the KB category/folder to delete."),
});

// Schema helpers for Sources
export const kbSourcesListInputSchema = kbSourceListQuerySchema.extend({
  kb_id: z
    .string()
    .optional()
    .describe("Target KB ID. If omitted, default KB is resolved."),
});

export const kbSourceCreateInputSchema = kbSourceCreateSchema
  .extend({
    kb_id: z
      .string()
      .optional()
      .describe("Target KB ID. If omitted, default KB is resolved."),
    ingest_config: kbSourceIngestConfigSchema
      .partial()
      .optional()
      .describe(
        "Optional ingestion configuration set at create time so one call configures the source end-to-end: agentic_instructions (the authoring brief for agentic ingestion — what wiki/structure to build), category_id (default folder for ingested articles), parent_article_id, template_id, template_mode, and the content switches (include_full_content, include_summary, include_questions, attach_original, split_long_articles)."
      ),
  })
  .describe(
    [
      "Create a KB data source. The `settings` object depends on `adapter_id`:",
      "• url       — { url: string (one URL per line, required) }",
      "• web_index — { index_url: string (required), restrict_to_base_urls?: string (newline-separated prefixes), limit?: number (default 10), crawl_depth?: number (default 2) }",
      "• sitemap   — { sitemap_url: string (required) }",
      "• firecrawl_url — { url: string (required) }",
      "• manual    — { title?: string, body_markdown?: string } — use for hand-authored content, NOT for web crawling",
      "• file_upload — { storage_object_key: string, original_filename: string }",
      "Do NOT use `manual` when the user wants to crawl a website — use `url`, `web_index`, or `sitemap` instead.",
    ].join("\n")
  );

export const kbSourceUpdateInputSchema = z.object({
  source_id: z.string().min(1).describe("Source ID to update."),
  patch: kbSourceUpdateSchema.describe("Partial source fields to update."),
});

export const kbSourceDeleteInputSchema = z.object({
  source_id: z.string().min(1).describe("Source ID to delete."),
});

export const kbSourceRunInputSchema = z.object({
  source_id: z.string().min(1).describe("Source ID to run."),
  options: kbSourceRunBodySchema
    .optional()
    .describe("Optional run configuration parameters."),
});

export const kbSourceRunsListInputSchema = z.object({
  source_id: z.string().min(1).describe("Source ID to fetch runs for."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe("Max recent runs to fetch."),
});

export const kbSourceItemsListInputSchema = kbSourceItemListQuerySchema.extend({
  source_id: z
    .string()
    .min(1)
    .describe("Source ID to fetch indexed items for."),
});

/**
 * `kb_source_analyze` — read-only planning step between sync and ingest.
 * Proposes the wiki structure and drafts the authoring brief; writes nothing.
 */
export const kbSourceAnalyzeInputSchema = kbSourceAnalyzeBodySchema
  .extend({
    source_id: z
      .string()
      .min(1)
      .describe("Source ID whose synced items to analyze."),
    hint: z
      .string()
      .max(1000)
      .optional()
      .describe(
        "Optional steer for the proposal, e.g. 'group by chapter' or 'focus on the duties of the builder'."
      ),
  })
  .describe(
    "Extract the concepts a source's synced items establish, propose the wiki pages those concepts should become, and draft the agentic authoring brief. Read-only — creates nothing. Run it before kb_source_ingest with strategy 'agentic' when the user has not written their own instructions, and show the returned concepts and pages before using suggested_instructions."
  );

/**
 * `kb_source_ingest` — phase 2 of the source pipeline. `kb_source_run` only
 * syncs (indexes + fetches raw items); THIS operation turns the synced items
 * into KB articles.
 */
export const kbSourceIngestInputSchema = kbSourceIngestBodySchema
  .extend({
    source_id: z
      .string()
      .min(1)
      .describe("Source ID whose synced items to ingest into articles."),
    strategy: kbSourceIngestStrategySchema.describe(
      "REQUIRED — how many articles to create, NOT what goes in them. 'per_entry' = one article per synced item. 'per_source' = one article for the whole source, all items merged. 'agentic' = dispatch an agent that reads the items and authors a structured wiki following the instructions/agentic_instructions brief — returns { task_id, async_run: true } and completes asynchronously. Use the content switches below to choose what each article contains."
    ),
    instructions: z
      .string()
      .max(2000)
      .optional()
      .describe(
        "Authoring brief for strategy 'agentic': what wiki/structure to build from the source items (e.g. 'Build a wiki about the Vienna building code, one article per section, grouped by chapter'). Falls back to the source's ingest_config.agentic_instructions when omitted."
      ),
    item_ids: z
      .array(z.string())
      .optional()
      .describe(
        "Restrict ingestion to these source item ids (from kb_source_items_list). Omit to ingest all active items."
      ),
    category_id: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Category (folder) to file the ingested articles in. Falls back to the source's ingest_config.category_id."
      ),
    parent_article_id: z
      .string()
      .optional()
      .describe(
        "Parent article to nest the ingested articles under. Falls back to ingest_config.parent_article_id."
      ),
    include_full_content: z
      .boolean()
      .optional()
      .describe(
        "Carry the source text into the article body verbatim. Default true unless include_summary is set."
      ),
    include_summary: z
      .boolean()
      .optional()
      .describe(
        "Generate a summary into the article's summary field, and as a body section. Combinable with include_full_content."
      ),
    include_questions: z
      .boolean()
      .optional()
      .describe(
        "Append a 'Questions answered' section (answers plus source citations) and fill articles.questions_answered."
      ),
    attach_original: z
      .boolean()
      .optional()
      .describe(
        "Link the entry's original document/URL on the article so it appears under Files."
      ),
    split_long_articles: z
      .boolean()
      .optional()
      .describe(
        "Split oversized bodies into sub-pages below a generated index page. With 'per_entry' the split follows the document's own headings; with 'per_source' each entry becomes one sub-page. Requires include_full_content."
      ),
  })
  .describe(
    "Ingest a source's synced items into KB articles. Run kb_source_run first (sync), verify the item count with kb_source_items_list, THEN ingest."
  );

// Schema helpers for Inbox promote
export const kbInboxPromoteInputSchema = z.object({
  inbox_id: z.string().min(1).describe("Inbox item ID to promote."),
  body: inboxPromoteSchema.describe(
    "Promotion specifications (target, title, tags, question)."
  ),
});

export const kbInboxPromoteBatchInputSchema = z.object({
  inbox_id: z.string().min(1).describe("Inbox item ID to promote."),
  body: inboxPromoteBatchBodySchema.describe(
    "Batch promotion steps and structures."
  ),
});

export const kbInboxDeleteInputSchema = z.object({
  inbox_id: z.string().min(1).describe("Inbox item ID to delete."),
});

export const kbInboxFetchSourceInputSchema = z.object({
  inbox_id: z
    .string()
    .min(1)
    .describe("Inbox item ID to fetch url source for."),
  body: inboxFetchSourceBodySchema
    .optional()
    .describe("Fetch parameters (force replacement)."),
});

// Schema helpers for versions
export const kbArticleVersionsListInputSchema = z.object({
  article_id: z.string().min(1).describe("Article ID to fetch versions for."),
});

export const kbArticleVersionRestoreInputSchema = z.object({
  article_id: z.string().min(1).describe("Article ID containing the version."),
  version_id: z.string().min(1).describe("Version ID to restore."),
});

// Schema helpers for attachments
export const kbArticleAttachmentsListInputSchema = z.object({
  article_id: z
    .string()
    .min(1)
    .describe("Article ID to fetch attachments for."),
});

export const kbArticleAttachmentAddInputSchema = z.object({
  article_id: z.string().min(1).describe("Article ID to attach to."),
  filename: z.string().min(1).describe("Filename of attachment."),
  storage_key: z.string().min(1).describe("Object key in files bucket."),
  mime_type: z.string().nullable().optional().describe("MIME type."),
  size_bytes: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .describe("Size in bytes."),
});

export const kbArticleAttachmentDeleteInputSchema = z.object({
  attachment_id: z.string().min(1).describe("Attachment row ID to delete."),
});
