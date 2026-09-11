import { z } from "zod";
import { type KbChunking, kbChunkingSchema } from "./chunking.js";
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

/**
 * Module settings. The scalar fields are tenant-wide index infrastructure: one
 * vector index serves every library in every space, so the embedding model and
 * the retrieval-quality knobs cannot differ per library. The `*_by_id` maps are
 * per-library values that ride along in the same blob for transport only; each
 * has its own write path on the KB record.
 */
export interface KbSettings {
  embedding_model: string;
  /** Per-KB id: chunking (scoped KV `kb.chunking` with `context.kb_id`). */
  kb_chunking_by_id: Record<string, KbChunking>;
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
  embedding_model: z.string().default("openai/text-embedding-3-small"),
  search_vector_min_similarity: z.number().min(0).max(1).default(0.45),
  search_verifier_min_query_terms: z.number().int().min(1).max(20).default(3),
  search_verifier_max_candidates: z.number().int().min(1).max(20).default(6),
  kb_chunking_by_id: z
    .record(z.string(), kbChunkingSchema)
    .optional()
    .default({}),
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
