import { z } from "zod";
import type { KbCommentsModeBinding } from "./comments.js";
import { kbCommentsModeBindingSchema } from "./comments.js";
import type { KbCover } from "./knowledge-bases.js";
import { kbCoverSchema } from "./knowledge-bases.js";
import {
  KB_CATEGORY_PAGE_BLOCKS_DEFAULTS,
  type KbCategoryCollectionSortBy,
  type KbPageBlock,
  kbCategoryCollectionSortBySchema,
  kbPageLayoutSettingsSchema,
  migrateLegacyCategoryToBlocks,
  normalizeCategoryPageBlocks,
} from "./page-blocks.js";
import { slugSchema } from "./shared.js";
import {
  type KbTemplateBindingMode,
  kbTemplateBindingModeSchema,
} from "./templates.js";

/* ── Category ── */

/**
 * Hierarchical category (folder) for KB articles.
 *
 * Every knowledge base has at least one category — the mandatory `general`
 * row created when the KB is first inserted (see migration). All articles
 * must belong to exactly one category. Categories may nest via
 * `parent_id` to form a tree; the root level is `parent_id === null`.
 *
 * Categories also have a **view page** (`/mdl/knowledge-base/c/:catSlug`).
 * The page surfaces a cover, an inline title, and configurable content /
 * category / article blocks driven by `page_settings.blocks`.
 */
/** How a category cover propagates to articles in this category tree. */
export type KbCoverInheritance = "none" | "direct_articles" | "all_children";

export const KB_COVER_INHERITANCE_DEFAULT: KbCoverInheritance = "none";

export const kbCoverInheritanceSchema = z.enum([
  "none",
  "direct_articles",
  "all_children",
]);

export function normalizeKbCoverInheritance(raw: unknown): KbCoverInheritance {
  const parsed = kbCoverInheritanceSchema.safeParse(raw);
  return parsed.success ? parsed.data : KB_COVER_INHERITANCE_DEFAULT;
}

export interface KbCategory {
  comments_mode: KbCommentsModeBinding;
  cover: KbCover | null;
  /** When set with a cover, controls which articles inherit this category cover. */
  cover_inheritance: KbCoverInheritance;
  created_at: string;
  description: string | null;
  /** Optional emoji shown on the category page and in the sidebar tree. */
  icon: string | null;
  id: string;
  intro_json: Record<string, unknown> | null;
  intro_markdown: string | null;
  /** True for the seeded default ("general") category that every KB owns. */
  is_default: boolean;
  kb_id: string;
  name: string;
  outro_json: Record<string, unknown> | null;
  outro_markdown: string | null;
  /** View page block layout + sidebar collection prefs. */
  page_settings: KbCategoryPageSettings;
  parent_id: string | null;
  scope_id: string;
  slug: string;
  sort_order: number;
  template_id: string | null;
  template_mode: KbTemplateBindingMode;
  tenant_id: string;
  updated_at: string;
  /** Folder vs collection — controls tree sorting / max-items, separate from the view page. */
  view_type: KbCategoryViewType;
}

export type KbCategoryViewType = "collection" | "folder";

export type {
  KbCategoryArticleListSource,
  KbCategoryCollectionSortBy,
} from "./page-blocks.js";
// biome-ignore lint/performance/noBarrelFile: backward-compatible re-exports for article list schemas
export {
  kbCategoryArticleListSourceSchema,
  kbCategoryCollectionSortBySchema,
} from "./page-blocks.js";

export interface KbCategoryPageSettings {
  blocks: KbPageBlock[];
  collection: {
    max_items: number;
    sort_by: KbCategoryCollectionSortBy;
  };
}

export const KB_CATEGORY_PAGE_SETTINGS_DEFAULTS: KbCategoryPageSettings = {
  blocks: KB_CATEGORY_PAGE_BLOCKS_DEFAULTS.blocks.map((b) => ({ ...b })),
  collection: { sort_by: "sort_order", max_items: 50 },
};

export type KbCategoryInput = Pick<
  KbCategory,
  "kb_id" | "name" | "slug" | "description" | "parent_id" | "sort_order"
> & {
  view_type?: KbCategoryViewType;
  comments_mode?: KbCommentsModeBinding;
  template_mode?: KbTemplateBindingMode;
  template_id?: string | null;
  page_settings?: KbCategoryPageSettings;
};

export type KbCategoryUpdateInput = Partial<
  Pick<
    KbCategory,
    | "comments_mode"
    | "cover"
    | "cover_inheritance"
    | "description"
    | "icon"
    | "intro_json"
    | "intro_markdown"
    | "name"
    | "outro_json"
    | "outro_markdown"
    | "page_settings"
    | "parent_id"
    | "slug"
    | "sort_order"
    | "template_id"
    | "template_mode"
    | "view_type"
  >
>;

export const KB_DEFAULT_CATEGORY_SLUG = "general";

/* ── Zod ── */

const tiptapJsonSchema: z.ZodType<Record<string, unknown>> = z
  .record(z.string(), z.unknown())
  .refine((v) => v && typeof v === "object" && !Array.isArray(v), {
    message: "intro/outro JSON must be an object",
  });

export const kbCategoryViewTypeSchema = z.enum(["collection", "folder"]);

export const kbCategoryPageSettingsSchema = z.object({
  blocks: kbPageLayoutSettingsSchema.shape.blocks,
  collection: z.object({
    sort_by: kbCategoryCollectionSortBySchema,
    max_items: z.number().int().min(1).max(500),
  }),
});

export interface CategoryPageSettingsNormalizeInput {
  intro_json?: Record<string, unknown> | null;
  intro_markdown?: string | null;
  outro_json?: Record<string, unknown> | null;
  outro_markdown?: string | null;
}

/** Coerce partial / legacy `page_settings` JSON into a fully-populated record. */
export function normalizeKbCategoryPageSettings(
  raw: unknown,
  legacy?: CategoryPageSettingsNormalizeInput
): KbCategoryPageSettings {
  const defaults = KB_CATEGORY_PAGE_SETTINGS_DEFAULTS;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (legacy) {
      return {
        collection: { ...defaults.collection },
        blocks: migrateLegacyCategoryToBlocks({
          ...legacy,
          page_settings: raw,
        }),
      };
    }
    return {
      blocks: defaults.blocks.map((b) => ({ ...b })),
      collection: { ...defaults.collection },
    };
  }

  const partial = raw as Partial<KbCategoryPageSettings> & {
    subcat_teasers?: unknown;
    article_list?: unknown;
    section_order?: unknown;
  };

  const hasLegacy =
    "subcat_teasers" in partial ||
    "article_list" in partial ||
    "section_order" in partial;

  const blocks = hasLegacy
    ? migrateLegacyCategoryToBlocks({
        intro_json: legacy?.intro_json ?? null,
        intro_markdown: legacy?.intro_markdown ?? null,
        outro_json: legacy?.outro_json ?? null,
        outro_markdown: legacy?.outro_markdown ?? null,
        page_settings: partial,
      })
    : normalizeCategoryPageBlocks(partial, {
        intro_json: legacy?.intro_json ?? null,
        intro_markdown: legacy?.intro_markdown ?? null,
        outro_json: legacy?.outro_json ?? null,
        outro_markdown: legacy?.outro_markdown ?? null,
        page_settings: partial,
      });

  const collectionPartial = partial.collection;
  return {
    blocks,
    collection: {
      sort_by:
        collectionPartial?.sort_by &&
        kbCategoryCollectionSortBySchema.safeParse(collectionPartial.sort_by)
          .success
          ? collectionPartial.sort_by
          : defaults.collection.sort_by,
      max_items:
        typeof collectionPartial?.max_items === "number" &&
        collectionPartial.max_items >= 1
          ? Math.min(Math.floor(collectionPartial.max_items), 500)
          : defaults.collection.max_items,
    },
  };
}

export const categoryCreateSchema = z.object({
  kb_id: z.string().min(1),
  name: z.string().min(1).max(256),
  slug: slugSchema,
  description: z.string().max(2048).nullable().optional(),
  parent_id: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional().default(0),
  view_type: kbCategoryViewTypeSchema.optional(),
  comments_mode: kbCommentsModeBindingSchema.optional(),
  template_mode: kbTemplateBindingModeSchema.optional(),
  template_id: z.string().nullable().optional(),
  page_settings: kbCategoryPageSettingsSchema.optional(),
});

export const categoryUpdateSchema = categoryCreateSchema
  .omit({ kb_id: true })
  .partial()
  .extend({
    cover: kbCoverSchema.nullable().optional(),
    cover_inheritance: kbCoverInheritanceSchema.optional(),
    icon: z.string().max(10).nullable().optional(),
    intro_json: tiptapJsonSchema.nullable().optional(),
    intro_markdown: z.string().nullable().optional(),
    outro_json: tiptapJsonSchema.nullable().optional(),
    outro_markdown: z.string().nullable().optional(),
    view_type: kbCategoryViewTypeSchema.optional(),
    page_settings: kbCategoryPageSettingsSchema.optional(),
    template_id: z.string().nullable().optional(),
    template_mode: kbTemplateBindingModeSchema.optional(),
    comments_mode: kbCommentsModeBindingSchema.optional(),
  });
