import { z } from "zod";
import type { KbCommentsModeBinding } from "./comments.js";
import { kbCommentsModeBindingSchema } from "./comments.js";
import type { KbCover } from "./knowledge-bases.js";
import type { ArticleStatus } from "./shared.js";
import { articleWritableStatusSchema, slugSchema } from "./shared.js";
import type { Tag } from "./tags.js";
import {
  type KbArticleTemplate,
  type KbTemplateBindingMode,
  kbTemplateBindingModeSchema,
} from "./templates.js";

/* ── Article ── */

export interface KbArticleDataSourceLink {
  id: string;
  name: string;
  /** Article maps to exactly one retrieved source item (direct ingest / URL match). */
  one_to_one: boolean;
  source_url: string | null;
}

export interface Article {
  /** Mandatory hierarchical folder this article lives in (defaults to KB's `general`). */
  category_id: string;
  /** Populated on detail GET when comments are enabled or closed. */
  comment_count?: number;
  /** Inherit or override KB/category comments policy. */
  comments_mode: KbCommentsModeBinding;
  content_json: Record<string, unknown> | null;
  content_markdown: string | null;
  created_at: string;
  created_by: string | null;
  /** Flat key/value custom fields (YAML frontmatter export). */
  custom_properties: Record<string, string | number | null>;
  deleted_at: string | null;
  /** Populated on article detail GET. */
  effective_comments_mode?: "none" | "enabled" | "closed";
  /** Populated on detail GET when a parent category cover applies to this page. */
  effective_cover?: KbCover | null;
  /** Populated on detail/list contexts that resolve template inheritance. */
  effective_template?: KbArticleTemplate | null;
  id: string;
  /** Populated on detail when the article traces to a KB source configuration. */
  kb_data_source?: KbArticleDataSourceLink | null;
  kb_id: string;
  /** When set, the page is locked (no content edits until cleared). */
  locked_at: string | null;
  /** Populated on detail: next page in KB reading order (sidebar tree / pre-order). */
  next_sibling?: { id: string; title: string } | null;
  original_document_name: string | null;
  original_document_url: string | null;
  /** Optional parent article for nested pages */
  parent_article_id: string | null;
  /** Populated on detail GET when `parent_article_id` is set. */
  parent_article_slug?: string | null;
  /** Populated on detail: ancestors from root to immediate parent */
  parent_chain?: Array<{ id: string; title: string }>;
  /** Populated on detail: previous page in KB reading order (sidebar tree / pre-order). */
  prev_sibling?: { id: string; title: string } | null;
  /** When true, there is no previous article; prev control should go to the KB hub. */
  prev_to_kb_hub?: boolean;
  published_at: string | null;
  questions_answered: string[];
  scope_id: string;
  slug: string;
  sort_order: number;
  status: ArticleStatus;
  summary: string | null;
  /** Populated when fetching with tags */
  tags?: Tag[];
  /** Effective template resolved by API when available. */
  template_id: string | null;
  template_mode: KbTemplateBindingMode;
  tenant_id: string;
  title: string;
  updated_at: string;
  /** Core user id of last editor; set by API on create/update. */
  updated_by: string | null;
}

export type ArticleInput = Pick<
  Article,
  | "kb_id"
  | "parent_article_id"
  | "title"
  | "slug"
  | "status"
  | "content_json"
  | "content_markdown"
  | "summary"
  | "questions_answered"
  | "original_document_url"
  | "original_document_name"
  | "sort_order"
> & {
  /** When omitted, the DAL resolves the KB's mandatory `general` category. */
  category_id?: string | null;
  custom_properties?: Record<string, string | number | null>;
  template_id?: string | null;
  template_mode?: KbTemplateBindingMode;
  comments_mode?: KbCommentsModeBinding;
};

export type ArticleUpdateInput = Partial<
  Omit<ArticleInput, "kb_id"> & {
    custom_properties: Record<string, string | number | null>;
    published_at: string | null;
    locked_at: string | null;
    template_id: string | null;
    template_mode: KbTemplateBindingMode;
    comments_mode: KbCommentsModeBinding;
  }
>;

/* ── Article Embedding ── */

export interface ArticleEmbedding {
  article_id: string;
  chunk_index: number;
  chunk_text: string;
  created_at: string;
  embedding: number[] | null;
  id: string;
  tenant_id: string;
}

/* ── Article ── */

const customPropertiesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.null()])
);

export const articleCreateSchema = z.object({
  kb_id: z.string().min(1),
  /**
   * Optional on the wire. When omitted (or null), the API resolves the KB's
   * mandatory `general` category before persistence.
   */
  category_id: z.string().nullable().optional(),
  parent_article_id: z.string().nullable().optional(),
  title: z.string().min(1).max(512),
  slug: slugSchema,
  status: articleWritableStatusSchema.optional().default("draft"),
  content_json: z.record(z.string(), z.unknown()).nullable().optional(),
  content_markdown: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  questions_answered: z.array(z.string()).optional().default([]),
  original_document_url: z.string().nullable().optional(),
  original_document_name: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional().default(0),
  tag_ids: z.array(z.string()).optional(),
  custom_properties: customPropertiesSchema.optional(),
  template_id: z.string().nullable().optional(),
  template_mode: kbTemplateBindingModeSchema.optional().default("inherit"),
  comments_mode: kbCommentsModeBindingSchema.optional().default("inherit"),
});

export const articleUpdateSchema = articleCreateSchema
  .omit({ kb_id: true })
  .partial()
  .extend({
    tag_ids: z.array(z.string()).optional(),
    locked_at: z.string().datetime().nullable().optional(),
  });

export const kbArticleGenerateSummarySchema = z.object({
  title: z.string().max(512).default(""),
  content_markdown: z.string().max(100_000).default(""),
});

export const kbArticleGenerateSummaryResponseSchema = z.object({
  summary: z.string().max(2048),
});
