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
  kbSourceCreateSchema,
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

export const kbArticlesListInputSchema = z.object({
  kb_id: z
    .string()
    .optional()
    .describe(
      "Target Knowledge Base id. Omit to list articles from the tenant default KB."
    ),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe("Number of article summary rows to return (1–50)."),
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
