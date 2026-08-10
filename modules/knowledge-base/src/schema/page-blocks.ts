import { uuidv7 } from "uuidv7";
import { z } from "zod";

/* ── Shared page block types (KB hub + category view pages) ── */

export type KbCategoryArticleListSource =
  | "direct_sorted"
  | "latest_created"
  | "recent_updated"
  | "latest_created_recursive"
  | "recent_updated_recursive"
  | "manual_pick";

export type KbCategoryCollectionSortBy =
  | "created_at"
  | "name"
  | "sort_order"
  | "updated_at"
  | `custom:${string}`;

export const kbCategoryArticleListSourceSchema = z.enum([
  "direct_sorted",
  "latest_created",
  "recent_updated",
  "latest_created_recursive",
  "recent_updated_recursive",
  "manual_pick",
]);

// The cast (not z.custom) keeps the `custom:${string}` template-literal type
// while the runtime schema stays a plain ZodString: the OpenAPI generator can
// only serialize known zod types — a z.custom here 500'd /api/openapi.json in
// prod, and the edge healthcheck probing that endpoint turned it into a full
// outage (v0.1.117/118).
export const kbCategoryCollectionSortBySchema = z
  .enum(["created_at", "name", "sort_order", "updated_at"])
  .or(
    z.string().startsWith("custom:") as unknown as z.ZodType<`custom:${string}`>
  );

export type KbPageBlockType = "articles" | "categories" | "content" | "faqs";

export type KbPageBlockViewStyle = "cards" | "list";

export type KbCategoriesBlockScope =
  | "direct_children"
  | "direct_plus_one"
  | "manual";

export type KbPageBlockSort = "created_at" | "name_asc" | "sort_order";

/** How category cards show article counts (mutually exclusive). */
export type KbCategoryCountDisplay = "none" | "direct" | "recursive";

export type KbPageArticlesBlockSource =
  | KbCategoryArticleListSource
  | "grouped_by_category";

export interface KbPageBlockBase {
  id: string;
  type: KbPageBlockType;
  visible: boolean;
}

export interface KbPageContentBlock extends KbPageBlockBase {
  content_json: Record<string, unknown> | null;
  content_markdown: string | null;
  type: "content";
}

export interface KbPageCategoriesBlock extends KbPageBlockBase {
  articles_include_drafts: boolean;
  articles_max_items: number;
  articles_sort_by: KbCategoryCollectionSortBy;
  category_count_display: KbCategoryCountDisplay;
  headline: string | null;
  manual_category_ids: string[];
  scope: KbCategoriesBlockScope;
  show_articles: boolean;
  show_description: boolean;
  show_icon: boolean;
  sort: KbPageBlockSort;
  style: KbPageBlockViewStyle;
  type: "categories";
}

export interface KbPageArticlesBlock extends KbPageBlockBase {
  grouped_by_category: boolean;
  headline: string | null;
  include_drafts: boolean;
  manual_article_ids: string[];
  max_items: number;
  property_filters: Record<string, string | number | null>;
  show_description: boolean;
  show_icon: boolean;
  sort_by: KbCategoryCollectionSortBy;
  source: KbPageArticlesBlockSource;
  style: KbPageBlockViewStyle;
  type: "articles";
}

export interface KbPageFaqsBlock extends KbPageBlockBase {
  headline: string | null;
  include_drafts: boolean;
  max_items: number;
  show_view_all_link: boolean;
  type: "faqs";
}

export type KbPageBlock =
  | KbPageArticlesBlock
  | KbPageCategoriesBlock
  | KbPageContentBlock
  | KbPageFaqsBlock;

export interface KbPageLayoutSettings {
  blocks: KbPageBlock[];
}

const tiptapJsonSchema: z.ZodType<Record<string, unknown>> = z
  .record(z.string(), z.unknown())
  .refine((v) => v && typeof v === "object" && !Array.isArray(v), {
    message: "content JSON must be an object",
  });

export const kbPageBlockViewStyleSchema = z.enum(["cards", "list"]);

export const kbCategoriesBlockScopeSchema = z.enum([
  "direct_children",
  "direct_plus_one",
  "manual",
]);

export const kbPageBlockSortSchema = z.enum([
  "sort_order",
  "name_asc",
  "created_at",
]);

export const kbCategoryCountDisplaySchema = z.enum([
  "none",
  "direct",
  "recursive",
]);

export const kbPageArticlesBlockSourceSchema =
  kbCategoryArticleListSourceSchema.or(z.literal("grouped_by_category"));

const kbPageBlockBaseSchema = z.object({
  id: z.string().min(1),
  visible: z.boolean(),
});

export const kbPageContentBlockSchema = kbPageBlockBaseSchema.extend({
  type: z.literal("content"),
  content_json: tiptapJsonSchema.nullable(),
  content_markdown: z.string().nullable(),
});

export const kbPageCategoriesBlockSchema = kbPageBlockBaseSchema.extend({
  type: z.literal("categories"),
  headline: z.string().max(256).nullable(),
  style: kbPageBlockViewStyleSchema,
  category_count_display: kbCategoryCountDisplaySchema,
  show_icon: z.boolean(),
  show_description: z.boolean(),
  show_articles: z.boolean(),
  articles_sort_by: kbCategoryCollectionSortBySchema,
  articles_max_items: z.number().int().min(1).max(200),
  articles_include_drafts: z.boolean(),
  scope: kbCategoriesBlockScopeSchema,
  manual_category_ids: z.array(z.string().min(1)).max(200),
  sort: kbPageBlockSortSchema,
});

export const kbPageArticlesBlockSchema = kbPageBlockBaseSchema.extend({
  type: z.literal("articles"),
  headline: z.string().max(256).nullable(),
  style: kbPageBlockViewStyleSchema,
  grouped_by_category: z.boolean(),
  show_icon: z.boolean(),
  show_description: z.boolean(),
  source: kbPageArticlesBlockSourceSchema,
  sort_by: kbCategoryCollectionSortBySchema,
  max_items: z.number().int().min(1).max(200),
  include_drafts: z.boolean(),
  manual_article_ids: z.array(z.string().min(1)).max(200),
  property_filters: z
    .record(z.string(), z.union([z.string(), z.number(), z.null()]))
    .optional()
    .default({}),
});

export const kbPageFaqsBlockSchema = kbPageBlockBaseSchema.extend({
  type: z.literal("faqs"),
  headline: z.string().max(256).nullable(),
  max_items: z.number().int().min(1).max(200),
  include_drafts: z.boolean(),
  show_view_all_link: z.boolean(),
});

export const kbPageBlockSchema = z.discriminatedUnion("type", [
  kbPageContentBlockSchema,
  kbPageCategoriesBlockSchema,
  kbPageArticlesBlockSchema,
  kbPageFaqsBlockSchema,
]);

export const kbPageLayoutSettingsSchema = z.object({
  blocks: z.array(kbPageBlockSchema).max(50),
});

export const DEFAULT_CATEGORIES_BLOCK: Omit<KbPageCategoriesBlock, "id"> = {
  type: "categories",
  visible: true,
  headline: null,
  style: "cards",
  category_count_display: "direct",
  show_icon: true,
  show_description: true,
  show_articles: false,
  articles_sort_by: "sort_order",
  articles_max_items: 6,
  articles_include_drafts: false,
  scope: "direct_children",
  manual_category_ids: [],
  sort: "sort_order",
};

export const DEFAULT_ARTICLES_BLOCK: Omit<KbPageArticlesBlock, "id"> = {
  type: "articles",
  visible: true,
  headline: null,
  style: "list",
  grouped_by_category: false,
  show_icon: false,
  show_description: true,
  source: "direct_sorted",
  sort_by: "sort_order",
  max_items: 24,
  include_drafts: false,
  manual_article_ids: [],
  property_filters: {},
};

export const DEFAULT_FAQS_BLOCK: Omit<KbPageFaqsBlock, "id"> = {
  type: "faqs",
  visible: true,
  headline: null,
  max_items: 5,
  include_drafts: false,
  show_view_all_link: true,
};

export const KB_HUB_PAGE_LAYOUT_DEFAULTS: KbPageLayoutSettings = {
  blocks: [
    {
      ...DEFAULT_CATEGORIES_BLOCK,
      id: "hub-default-categories",
      scope: "direct_children",
      style: "cards",
    },
    {
      ...DEFAULT_ARTICLES_BLOCK,
      id: "hub-default-articles",
      source: "recent_updated_recursive",
      max_items: 8,
      style: "list",
    },
    {
      ...DEFAULT_FAQS_BLOCK,
      id: "hub-default-faqs",
    },
  ],
};

export const KB_CATEGORY_PAGE_BLOCKS_DEFAULTS: KbPageLayoutSettings = {
  blocks: [
    {
      ...DEFAULT_CATEGORIES_BLOCK,
      id: "category-default-categories",
    },
    {
      ...DEFAULT_ARTICLES_BLOCK,
      id: "category-default-articles",
      style: "cards",
    },
  ],
};

export function createPageBlockId(): string {
  return uuidv7();
}

export function createDefaultContentBlock(): KbPageContentBlock {
  return {
    id: createPageBlockId(),
    type: "content",
    visible: true,
    content_json: null,
    content_markdown: null,
  };
}

export function createDefaultCategoriesBlock(): KbPageCategoriesBlock {
  return {
    ...DEFAULT_CATEGORIES_BLOCK,
    id: createPageBlockId(),
  };
}

export function createDefaultArticlesBlock(): KbPageArticlesBlock {
  return {
    ...DEFAULT_ARTICLES_BLOCK,
    id: createPageBlockId(),
  };
}

export function createDefaultFaqsBlock(): KbPageFaqsBlock {
  return {
    ...DEFAULT_FAQS_BLOCK,
    id: createPageBlockId(),
  };
}

function jsonDocHasContent(json: Record<string, unknown> | null): boolean {
  if (!json) {
    return false;
  }
  const content = (json as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) {
    return false;
  }
  return content.some((node) => {
    if (!node || typeof node !== "object") {
      return false;
    }
    const inner = (node as { content?: unknown }).content;
    if (!Array.isArray(inner)) {
      return false;
    }
    return inner.some((leaf) => {
      const text = (leaf as { text?: string }).text;
      return typeof text === "string" && text.trim().length > 0;
    });
  });
}

function legacyStyleToViewStyle(
  style: "grid" | "list" | undefined
): KbPageBlockViewStyle {
  return style === "list" ? "list" : "cards";
}

/** Legacy category `page_settings` shape (pre-block migration). */
export interface LegacyKbCategoryPageSettings {
  article_list?: {
    headline?: string | null;
    manual_article_ids?: string[];
    max_items?: number;
    property_filters?: Record<string, string | number | null>;
    source?: KbCategoryArticleListSource;
    style?: "grid" | "list";
    visible?: boolean;
  };
  collection?: {
    max_items?: number;
    sort_by?: KbCategoryCollectionSortBy;
  };
  section_order?: string[];
  subcat_teasers?: {
    headline?: string | null;
    visible?: boolean;
  };
}

export interface CategoryLegacyMigrationInput {
  intro_json?: Record<string, unknown> | null;
  intro_markdown?: string | null;
  outro_json?: Record<string, unknown> | null;
  outro_markdown?: string | null;
  page_settings?: unknown;
}

export function migrateLegacyCategoryToBlocks(
  input: CategoryLegacyMigrationInput
): KbPageBlock[] {
  const raw = input.page_settings;
  const legacy =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as LegacyKbCategoryPageSettings)
      : {};

  const blocks: KbPageBlock[] = [];

  if (jsonDocHasContent(input.intro_json ?? null)) {
    blocks.push({
      id: "legacy:intro",
      type: "content",
      visible: true,
      content_json: input.intro_json ?? null,
      content_markdown: input.intro_markdown ?? null,
    });
  }

  const sectionOrder = Array.isArray(legacy.section_order)
    ? legacy.section_order
    : ["subcat_teasers", "article_list"];

  for (const slot of sectionOrder) {
    if (slot === "subcat_teasers") {
      blocks.push({
        ...DEFAULT_CATEGORIES_BLOCK,
        id: "legacy:subcat_teasers",
        visible: legacy.subcat_teasers?.visible ?? true,
        headline:
          typeof legacy.subcat_teasers?.headline === "string"
            ? legacy.subcat_teasers.headline
            : null,
      });
    } else if (slot === "article_list") {
      const al = legacy.article_list ?? {};
      blocks.push({
        ...DEFAULT_ARTICLES_BLOCK,
        id: "legacy:article_list",
        visible: al.visible ?? true,
        headline: typeof al.headline === "string" ? al.headline : null,
        source: al.source ?? DEFAULT_ARTICLES_BLOCK.source,
        style: legacyStyleToViewStyle(al.style),
        max_items:
          typeof al.max_items === "number" && al.max_items >= 1
            ? Math.min(al.max_items, 200)
            : DEFAULT_ARTICLES_BLOCK.max_items,
        manual_article_ids: Array.isArray(al.manual_article_ids)
          ? al.manual_article_ids.filter(
              (s): s is string => typeof s === "string" && s.length > 0
            )
          : [],
        property_filters:
          al.property_filters &&
          typeof al.property_filters === "object" &&
          !Array.isArray(al.property_filters)
            ? Object.fromEntries(
                Object.entries(al.property_filters).filter(
                  ([, v]) =>
                    v === null || typeof v === "string" || typeof v === "number"
                )
              )
            : {},
      });
    }
  }

  if (blocks.length === 0) {
    return [...KB_CATEGORY_PAGE_BLOCKS_DEFAULTS.blocks];
  }

  if (jsonDocHasContent(input.outro_json ?? null)) {
    blocks.push({
      id: "legacy:outro",
      type: "content",
      visible: true,
      content_json: input.outro_json ?? null,
      content_markdown: input.outro_markdown ?? null,
    });
  }

  return blocks;
}

function isLegacyCategoryPageSettings(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  const record = raw as Record<string, unknown>;
  return (
    ("subcat_teasers" in record || "article_list" in record) &&
    !("blocks" in record)
  );
}

/** Map legacy categories-block count checkboxes to a single display mode. */
export function legacyCategoryCountFlagsToDisplay(
  showDirect: boolean,
  showRecursive: boolean
): KbCategoryCountDisplay {
  if (showRecursive) {
    return "recursive";
  }
  if (showDirect) {
    return "direct";
  }
  return "none";
}

function preprocessPageBlockRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const source = raw as Record<string, unknown>;
  const {
    show_count_direct: legacyShowDirect,
    show_count_recursive: legacyShowRecursive,
    ...rest
  } = source;
  const type = rest.type;

  if (type === "categories") {
    const record = { ...rest } as Record<string, unknown>;
    if (
      !("category_count_display" in record) &&
      (legacyShowDirect !== undefined || legacyShowRecursive !== undefined)
    ) {
      record.category_count_display = legacyCategoryCountFlagsToDisplay(
        legacyShowDirect === true,
        legacyShowRecursive === true
      );
    }
    return record;
  }

  if (type === "articles" || type === "faqs") {
    return rest;
  }

  return source;
}

function appendMissingFaqsBlock(blocks: KbPageBlock[]): KbPageBlock[] {
  if (blocks.some((b) => b.type === "faqs")) {
    return blocks;
  }
  return [
    ...blocks,
    {
      ...DEFAULT_FAQS_BLOCK,
      id: "legacy:faqs",
    },
  ];
}

export interface NormalizeKbPageLayoutOptions {
  /** Hub-only: append FAQs block when missing (replaces fixed footer section). */
  append_missing_faqs?: boolean;
}

function normalizeSingleBlock(raw: unknown): KbPageBlock | null {
  const parsed = kbPageBlockSchema.safeParse(preprocessPageBlockRaw(raw));
  return parsed.success ? (parsed.data as KbPageBlock) : null;
}

/** Normalize hub or category block layout from JSON. */
export function normalizeKbPageLayoutSettings(
  raw: unknown,
  defaults: KbPageLayoutSettings = KB_HUB_PAGE_LAYOUT_DEFAULTS,
  options?: NormalizeKbPageLayoutOptions
): KbPageLayoutSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      blocks: defaults.blocks.map((b) => ({ ...b })),
    };
  }
  const partial = raw as Partial<KbPageLayoutSettings>;
  if (!Array.isArray(partial.blocks)) {
    return {
      blocks: defaults.blocks.map((b) => ({ ...b })),
    };
  }
  let blocks = partial.blocks
    .map((b) => normalizeSingleBlock(b))
    .filter((b): b is KbPageBlock => b !== null);
  if (blocks.length === 0) {
    blocks = [...defaults.blocks];
  }
  if (options?.append_missing_faqs) {
    blocks = appendMissingFaqsBlock(blocks);
  }
  return { blocks };
}

export function normalizeCategoryPageBlocks(
  pageSettings: unknown,
  legacyInput: CategoryLegacyMigrationInput
): KbPageBlock[] {
  if (isLegacyCategoryPageSettings(pageSettings)) {
    return migrateLegacyCategoryToBlocks({
      ...legacyInput,
      page_settings: pageSettings,
    });
  }
  const normalized = normalizeKbPageLayoutSettings(
    pageSettings,
    KB_CATEGORY_PAGE_BLOCKS_DEFAULTS
  );
  return normalized.blocks;
}

export function movePageBlock(
  settings: KbPageLayoutSettings,
  blockId: string,
  direction: -1 | 1
): KbPageLayoutSettings {
  const blocks = [...settings.blocks];
  const idx = blocks.findIndex((b) => b.id === blockId);
  const target = idx + direction;
  if (idx < 0 || target < 0 || target >= blocks.length) {
    return settings;
  }
  const current = blocks[idx];
  const swap = blocks[target];
  if (!(current && swap)) {
    return settings;
  }
  blocks[idx] = swap;
  blocks[target] = current;
  return { ...settings, blocks };
}

export function togglePageBlockVisibility(
  settings: KbPageLayoutSettings,
  blockId: string
): KbPageLayoutSettings {
  return {
    ...settings,
    blocks: settings.blocks.map((b) =>
      b.id === blockId ? { ...b, visible: !b.visible } : b
    ),
  };
}

export function addPageBlock(
  settings: KbPageLayoutSettings,
  block: KbPageBlock
): KbPageLayoutSettings {
  return { ...settings, blocks: [...settings.blocks, block] };
}

export function removePageBlock(
  settings: KbPageLayoutSettings,
  blockId: string
): KbPageLayoutSettings {
  const next = settings.blocks.filter((b) => b.id !== blockId);
  return { blocks: next.length > 0 ? next : settings.blocks };
}

export function updatePageBlock(
  settings: KbPageLayoutSettings,
  blockId: string,
  patch: Partial<KbPageBlock>
): KbPageLayoutSettings {
  return {
    ...settings,
    blocks: settings.blocks.map((b) =>
      b.id === blockId ? ({ ...b, ...patch } as KbPageBlock) : b
    ),
  };
}
