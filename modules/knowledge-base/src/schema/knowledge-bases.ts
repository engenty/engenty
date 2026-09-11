import { z } from "zod";
import { type KbChunking, kbChunkingSchema } from "./chunking.js";
import type { KbRootCommentsMode } from "./comments.js";
import { kbRootCommentsModeSchema } from "./comments.js";
import {
  type KbPageLayoutSettings,
  kbPageLayoutSettingsSchema,
} from "./page-blocks.js";
import { slugSchema } from "./shared.js";

/* ── Article custom property definitions (per KB) ── */

export type ArticlePropertyDefinitionType =
  | "text"
  | "number"
  | "date"
  | "url"
  | "select";

/** Built-in metadata rows persisted in `article_property_definitions` (order / visibility / compact). */
export const ARTICLE_BUILTIN_PROPERTY_KEYS = [
  "created_at",
  "created_by",
  "updated_at",
  "status",
  "tags",
  "comments",
  "comments_mode",
  "category_id",
  "parent_article_id",
] as const;

export type ArticleBuiltinPropertyKey =
  (typeof ARTICLE_BUILTIN_PROPERTY_KEYS)[number];

/** Built-in rows pinned in article compact metadata by default. */
export const ARTICLE_BUILTIN_COMPACT_PIN_KEYS = [
  "updated_at",
  "tags",
  "comments",
] as const satisfies readonly ArticleBuiltinPropertyKey[];

const ARTICLE_BUILTIN_COMPACT_PIN_SET = new Set<string>(
  ARTICLE_BUILTIN_COMPACT_PIN_KEYS
);

const CUSTOM_KEY_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const builtinRefSchema = z.enum([
  "created_at",
  "created_by",
  "updated_at",
  "status",
  "tags",
  "comments",
  "comments_mode",
  "category_id",
  "parent_article_id",
]);

export interface ArticlePropertyDefinition {
  /** System field — key must match `builtin_ref`; label may be empty (i18n on read). */
  builtin_ref?: ArticleBuiltinPropertyKey;
  id: string;
  key: string;
  label: string;
  options?: string[];
  order: number;
  /** Reserved for compact article chrome (detail page). Default false. */
  show_in_compact?: boolean;
  type: ArticlePropertyDefinitionType;
  /** When false, hide on article detail (custom + built-in). Default true. */
  visible?: boolean;
}

export const articlePropertyDefinitionSchema = z
  .object({
    id: z.string().min(1),
    key: z.string().min(1).max(64),
    label: z.string().max(256).default(""),
    order: z.number().int().min(0),
    type: z.enum(["text", "number", "date", "url", "select"]),
    options: z.array(z.string().min(1)).optional(),
    builtin_ref: builtinRefSchema.optional(),
    visible: z.boolean().optional().default(true),
    show_in_compact: z.boolean().optional().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.builtin_ref) {
      if (val.key !== val.builtin_ref) {
        ctx.addIssue({
          code: "custom",
          message: "builtin key must match builtin_ref",
          path: ["key"],
        });
      }
      return;
    }
    if (!CUSTOM_KEY_REGEX.test(val.key)) {
      ctx.addIssue({
        code: "custom",
        message: "key must be lowercase slug segments (a-z, 0-9, hyphen)",
        path: ["key"],
      });
    }
    if (!val.label.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "label is required for custom properties",
        path: ["label"],
      });
    }
  });

export const articlePropertyDefinitionsSchema = z
  .array(articlePropertyDefinitionSchema)
  .superRefine((arr, ctx) => {
    const seenBuiltin = new Set<string>();
    for (let i = 0; i < arr.length; i++) {
      const row = arr[i];
      if (!row.builtin_ref) {
        continue;
      }
      if (seenBuiltin.has(row.builtin_ref)) {
        ctx.addIssue({
          code: "custom",
          message: "duplicate builtin_ref",
          path: [i, "builtin_ref"],
        });
      }
      seenBuiltin.add(row.builtin_ref);
    }
  });

/** Default built-in rows (canonical order) for KBs without persisted layout. */
export function kbDefaultBuiltinPropertyDefinitions(): ArticlePropertyDefinition[] {
  return ARTICLE_BUILTIN_PROPERTY_KEYS.map((key, order) => ({
    id: `kb-builtin-${key}`,
    key,
    label: "",
    type: "text",
    order,
    builtin_ref: key,
    visible: true,
    show_in_compact: ARTICLE_BUILTIN_COMPACT_PIN_SET.has(key),
  }));
}

/**
 * Merge stored definitions with built-in layout rows.
 * Legacy KBs (custom-only array) get built-ins prepended in default order.
 */
export function kbMergeArticlePropertyDefinitions(
  stored: ArticlePropertyDefinition[] | undefined | null
): ArticlePropertyDefinition[] {
  const raw = [...(stored ?? [])];
  if (!raw.some((r) => r.builtin_ref)) {
    const customs = [...raw].sort((a, b) => a.order - b.order);
    const builtins = kbDefaultBuiltinPropertyDefinitions();
    return [...builtins, ...customs].map((r, i) => ({ ...r, order: i }));
  }
  let merged = [...raw].sort((a, b) => a.order - b.order);
  for (const key of ARTICLE_BUILTIN_PROPERTY_KEYS) {
    if (!merged.some((r) => r.builtin_ref === key)) {
      const def = kbDefaultBuiltinPropertyDefinitions().find(
        (d) => d.builtin_ref === key
      )!;
      merged.push({ ...def, order: merged.length });
    }
  }
  merged = merged
    .sort((a, b) => a.order - b.order)
    .map((r, i) => ({ ...r, order: i }));
  return merged;
}

/* ── Knowledge Base Cover ── */

/** Attribution when the hub cover image came from Unsplash (stored with cover in KV). */
export interface KbCoverImageSourceUnsplash {
  kind: "unsplash";
  photo_url: string;
  photographer_name: string;
  photographer_url: string;
}

export type KbCoverImageSource = KbCoverImageSourceUnsplash;

/**
 * "color": solid hex/oklch; "gradient": CSS gradient string;
 * "image": HTTPS URL, or a vault object key (resolved to a signed URL in the hub UI).
 */
export type KbCover =
  | { type: "color"; value: string }
  | { type: "gradient"; value: string }
  | { type: "image"; value: string; source?: KbCoverImageSource };

const kbCoverImageSourceSchema = z.object({
  kind: z.literal("unsplash"),
  photo_url: z.string().min(1).max(512),
  photographer_name: z.string().min(1).max(128),
  photographer_url: z.string().min(1).max(512),
});

export const kbCoverSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("color"), value: z.string().max(128) }),
  z.object({ type: z.literal("gradient"), value: z.string().max(512) }),
  z.object({
    type: z.literal("image"),
    value: z.string().min(1).max(2048),
    source: kbCoverImageSourceSchema.optional(),
  }),
]);

/* ── Knowledge Base ── */

export interface KnowledgeBase {
  article_property_definitions: ArticlePropertyDefinition[];
  /**
   * The library's own chunking, or null when it follows `KB_CHUNKING_DEFAULTS`.
   * Stored in `kb_settings` KV `kb.chunking` with `context = { kb_id }`.
   * Populated by the API layer.
   */
  chunking: KbChunking | null;
  /** KB-wide default for article comments (no inherit at this level). */
  comments_mode: KbRootCommentsMode;
  /**
   * Optional cover — stored in `kb_settings` as KV row `kb.display` with
   * `context = { kb_id }`, not as a column on `knowledge_bases`. Populated by the API layer.
   */
  cover: KbCover | null;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
  description: string | null;
  /**
   * Optional emoji or short text icon — stored in `kb_settings` as KV row `kb.display` with
   * `context = { kb_id }`, not as a column on `knowledge_bases`. Populated by the API layer.
   */
  icon: string | null;
  id: string;
  name: string;
  /**
   * Hub start page block layout — stored in `kb_settings` KV `kb.page_layout`
   * with `context = { kb_id }`. Populated by the API layer.
   */
  page_layout: KbPageLayoutSettings;
  scope_id: string;
  slug: string;
  /**
   * The space this library belongs to (PLAN-spaces.md Phase 6b).
   *
   * REQUIRED — a knowledge base is part of a space's file tree, so it lives in
   * exactly one space the way goals, tasks and projects do. Phase 4 modelled a
   * tenant-wide tier here (NULL = every space's Drive shows it); that tier no
   * longer exists. A library several spaces shared now belongs to one of them.
   */
  space_id: string;
  tenant_id: string;
  updated_at: string;
}

export type KnowledgeBaseInput = Pick<
  KnowledgeBase,
  "name" | "slug" | "description"
> & {
  /** Optional on INPUT only: the DAL resolves the tenant's default space. */
  space_id?: string;
};

/** DB-only fields: excludes display fields stored in scoped `kb_settings` KV. */
export type KnowledgeBaseUpdateInput = Partial<
  KnowledgeBaseInput & {
    article_property_definitions: ArticlePropertyDefinition[];
    comments_mode: KbRootCommentsMode;
  }
>;

/* ── Knowledge Base ── */

/** Fields stored in the `knowledge_bases` table. */
export const knowledgeBaseCreateSchema = z.object({
  name: z.string().min(1).max(256),
  slug: slugSchema,
  description: z.string().max(2048).nullable().optional(),
  /** Omitted = the tenant's default space; there is no tenant-wide tier. */
  space_id: z.string().uuid().optional(),
});

/**
 * Extends create schema with `icon` and `cover` — display fields stored in
 * `kb_settings` KV (`kb.display` per `kb_id`), handled separately in the PUT route handler.
 */
export const knowledgeBaseUpdateSchema = knowledgeBaseCreateSchema
  .partial()
  .extend({
    article_property_definitions: articlePropertyDefinitionsSchema.optional(),
    comments_mode: kbRootCommentsModeSchema.optional(),
    icon: z.string().max(10).nullable().optional(),
    cover: kbCoverSchema.nullable().optional(),
    page_layout: kbPageLayoutSettingsSchema.optional(),
    /** `null` clears the library's own chunking so it follows the defaults again. */
    chunking: kbChunkingSchema.nullable().optional(),
  });
