import { z } from "zod";
import {
  type KbSidebarArticleTreePrefs,
  kbSidebarArticleTreePrefsSchema,
} from "./kb-sidebar-article-tree.js";
import { type KbCover, kbCoverSchema } from "./knowledge-bases.js";
import {
  type KbPageLayoutSettings,
  kbPageLayoutSettingsSchema,
} from "./page-blocks.js";

/* ── KB Display (per-KB visual settings stored in kb_settings) ── */

export interface KbDisplay {
  cover?: KbCover | null;
  icon?: string | null;
}

export const kbDisplaySchema = z.object({
  icon: z.string().max(10).nullable().optional(),
  cover: kbCoverSchema.nullable().optional(),
});

/* ── KB Settings ── */

export interface KbSettings {
  auto_generate_questions: boolean;
  auto_generate_summary: boolean;
  /** Maximum character length of each chunk for embedding. */
  chunk_max_length: number;
  /** Character overlap between consecutive chunks. */
  chunk_overlap: number;
  /** Chunking strategy used by @mastra/rag MDocument.chunk(). */
  chunk_strategy:
    | "character"
    | "html"
    | "json"
    | "markdown"
    | "recursive"
    | "semantic-markdown"
    | "sentence"
    | "token";
  default_kb_id: string | null;
  embedding_model: string;
  /** Per-KB id: icon/cover (scoped KV `kb.display` with `context.kb_id`). */
  kb_display_by_id: Record<string, KbDisplay>;
  /** Per-KB id: hub start page blocks (scoped KV `kb.page_layout`). */
  kb_page_layout_by_id: Record<string, KbPageLayoutSettings>;
  /** Default vector similarity floor for semantic KB search when requests omit match_threshold. */
  search_vector_min_similarity: number;
  /** Maximum vector candidates submitted to the optional LLM verifier. */
  search_verifier_max_candidates: number;
  /** Minimum query terms before the optional LLM verifier may run. */
  search_verifier_min_query_terms: number;
  /** Per–knowledge-base id: default article sidebar tree prefs (KV `kb.sidebar_article_tree.defaults`, merged with code defaults on read). */
  sidebar_article_tree_defaults_by_kb: Record<
    string,
    KbSidebarArticleTreePrefs
  >;
}

export type KbSettingsInput = KbSettings;

/* ── Settings ── */

export const kbSettingsSchema = z.object({
  default_kb_id: z.string().nullable().optional(),
  embedding_model: z.string().default("openai/text-embedding-3-small"),
  auto_generate_summary: z.boolean().default(true),
  auto_generate_questions: z.boolean().default(true),
  chunk_strategy: z
    .enum([
      "recursive",
      "character",
      "token",
      "markdown",
      "html",
      "json",
      "sentence",
      "semantic-markdown",
    ])
    .default("recursive"),
  chunk_max_length: z.number().int().min(100).max(8000).default(1000),
  chunk_overlap: z.number().int().min(0).max(2000).default(100),
  search_vector_min_similarity: z.number().min(0).max(1).default(0.45),
  search_verifier_min_query_terms: z.number().int().min(1).max(20).default(3),
  search_verifier_max_candidates: z.number().int().min(1).max(20).default(6),
  kb_display_by_id: z
    .record(z.string(), kbDisplaySchema)
    .optional()
    .default({}),
  kb_page_layout_by_id: z
    .record(z.string(), kbPageLayoutSettingsSchema)
    .optional()
    .default({}),
  sidebar_article_tree_defaults_by_kb: z
    .record(z.string(), kbSidebarArticleTreePrefsSchema)
    .optional()
    .default({}),
});
