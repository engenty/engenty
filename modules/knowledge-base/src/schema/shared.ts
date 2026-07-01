import { z } from "zod";
// shared types

/* ── Status ── */

export type ArticleStatus = "draft" | "published" | "archived" | "removed";
export type FaqStatus = "draft" | "published" | "archived";

/* ── Query params ── */

export type ArticleSortColumn =
  | "title"
  | "created_at"
  | "updated_at"
  | "sort_order"
  | "status"
  | `custom:${string}`;

export interface ArticlesQueryParams {
  /** When set, restrict to articles in this category. */
  category_id?: string;
  kb_id: string;
  page?: number;
  page_size?: number;
  parent_article_id?: string | null;
  search?: string;
  /** When true, use Postgres full-text search for `search` (requires non-empty search) */
  search_fts?: boolean;
  sort_by?: ArticleSortColumn;
  sort_order?: "asc" | "desc";
  status?: ArticleStatus;
  tag_ids?: string[];
  template_property_filters?: Record<string, string | number | null>;
  /** When true, only articles with no parent_article_id */
  top_level_only?: boolean;
}

export type FaqSortColumn =
  | "question"
  | "created_at"
  | "updated_at"
  | "sort_order"
  | "status";

export interface FaqsQueryParams {
  kb_id: string;
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: FaqSortColumn;
  sort_order?: "asc" | "desc";
  status?: FaqStatus;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  page_size: number;
  total: number;
}

/* ── Search ── */

export interface KbSearchResult {
  article_id: string;
  chunk_text: string;
  end_line?: number;
  kb_slug?: string;
  score: number;
  slug?: string;
  start_line?: number;
  title: string;
  url?: string;
}

export interface KbSearchResponse {
  results: KbSearchResult[];
  timings?: Record<string, number>;
}

/* ── Status enum ── */

export const articleStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
  "removed",
]);

/** Allowed on create/update from clients (not `removed` — that is set by trash/soft-delete). */
export const articleWritableStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);
export const faqStatusSchema = z.enum(["draft", "published", "archived"]);

/* ── Slug validation ── */

export const slugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[a-z0-9][a-z0-9-]*$/,
    "Slug must be lowercase alphanumeric with dashes"
  );

/* ── Query params ── */

export const articlesQuerySchema = z.object({
  kb_id: z.string().min(1),
  category_id: z.string().min(1).optional(),
  top_level_only: z.boolean().optional(),
  parent_article_id: z.string().nullable().optional(),
  status: articleStatusSchema.optional(),
  tag_ids: z.array(z.string()).optional(),
  search: z.string().optional(),
  search_fts: z.boolean().optional(),
  page: z.number().int().min(1).optional().default(1),
  page_size: z.number().int().min(1).max(500).optional().default(25),
  sort_by: z
    .string()
    .refine(
      (value) =>
        ["title", "created_at", "updated_at", "sort_order", "status"].includes(
          value
        ) || value.startsWith("custom:"),
      "Invalid article sort column"
    )
    .optional()
    .default("sort_order"),
  sort_order: z.enum(["asc", "desc"]).optional().default("asc"),
  template_property_filters: z
    .record(z.string(), z.union([z.string(), z.number(), z.null()]))
    .optional(),
});

export const faqSortColumnSchema = z.enum([
  "question",
  "created_at",
  "updated_at",
  "sort_order",
  "status",
]);

export const faqsQuerySchema = z.object({
  kb_id: z.string().min(1),
  status: faqStatusSchema.optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).optional().default(1),
  page_size: z.number().int().min(1).max(200).optional().default(25),
  sort_by: faqSortColumnSchema.optional().default("sort_order"),
  sort_order: z.enum(["asc", "desc"]).optional().default("asc"),
});

/* ── Search ── */

// Filter schema exposed on the synthesized `kb.article.search` operation
// (see `registerSearchIndexProvider` in `src/plugin.ts`). The host strips
// `tenant_id`/`user_id` from caller filters and re-injects authenticated
// values, so we only model the user-facing knobs here.
export const kbArticlesSearchFiltersSchema = z.object({
  kb_id: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Knowledge Base id. Omit to fan out across every accessible KB in the tenant."
    ),
  match_threshold: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .optional()
    .describe(
      "Minimum cosine similarity (1 − distance). Omit/null = no floor (pure k-NN)."
    ),
  max_vector_distance: z
    .number()
    .min(0)
    .max(2)
    .nullable()
    .optional()
    .describe("Maximum pgvector cosine distance; omit or null = no ceiling."),
  use_vector: z
    .boolean()
    .optional()
    .describe(
      'Set false to force lexical (BM25/FTS) only — equivalent to strategy: "lexical".'
    ),
  fts_fallback: z
    .boolean()
    .optional()
    .describe(
      "When true (default) merge FTS hits with vector hits in hybrid mode."
    ),
  verifier: z
    .boolean()
    .optional()
    .describe(
      "Run an optional LLM relevance verifier on long vector queries (slower)."
    ),
});

/* ── Knowledge Graph ── */

export interface KbGraphNode {
  id: string;
  parent_article_id: string | null;
  slug: string;
  /** Used for a fallback “reading order” spine when no tree/links/tag edges exist. */
  sort_order: number;
  status: ArticleStatus;
  tag_ids: string[];
  title: string;
}

export interface KbGraphTag {
  color: string | null;
  id: string;
  name: string;
}

/** Directed edge: source article’s body contains an inline link to the target article. */
export interface KbGraphInlineLink {
  from_article_id: string;
  to_article_id: string;
}

export interface KbGraphData {
  inline_links: KbGraphInlineLink[];
  nodes: KbGraphNode[];
  tags: KbGraphTag[];
}
