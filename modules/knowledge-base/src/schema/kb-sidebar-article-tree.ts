import { z } from "zod";

export type KbSidebarArticleViewMode = "list" | "folder";
export type KbSidebarArticleSortBy = "title" | "created" | "edited" | "manual";

export interface KbSidebarArticleTreePrefs {
  maxPerLevel: number;
  sortBy: KbSidebarArticleSortBy;
  sortOrder: "asc" | "desc";
  viewMode: KbSidebarArticleViewMode;
}

export const KB_SIDEBAR_ARTICLE_TREE_DEFAULTS: KbSidebarArticleTreePrefs = {
  maxPerLevel: 20,
  sortBy: "edited",
  sortOrder: "desc",
  viewMode: "folder",
};

export function clampSidebarMaxPerLevel(n: number): number {
  return Math.min(100, Math.max(3, Math.round(n)));
}

const sortByEnum = z.enum(["title", "created", "edited", "manual"]);
const sortOrderEnum = z.enum(["asc", "desc"]);
const viewModeEnum = z.enum(["list", "folder"]);

export const kbSidebarArticleTreePrefsPartialSchema = z
  .object({
    maxPerLevel: z.number().int().min(3).max(100).optional(),
    sortBy: sortByEnum.optional(),
    sortOrder: sortOrderEnum.optional(),
    viewMode: viewModeEnum.optional(),
  })
  .strict();

export const kbSidebarArticleTreePrefsSchema = z
  .object({
    maxPerLevel: z.number().int().min(3).max(100),
    sortBy: sortByEnum,
    sortOrder: sortOrderEnum,
    viewMode: viewModeEnum,
  })
  .strict();

function mergeKbSidebarArticleTreePrefsWithBase(
  partial: Partial<KbSidebarArticleTreePrefs> | null | undefined,
  base: KbSidebarArticleTreePrefs
): KbSidebarArticleTreePrefs {
  const d = base;
  if (!partial) {
    return { ...d };
  }
  const viewMode =
    partial.viewMode === "list" || partial.viewMode === "folder"
      ? partial.viewMode
      : d.viewMode;
  const sortBy =
    partial.sortBy === "title" ||
    partial.sortBy === "created" ||
    partial.sortBy === "edited" ||
    partial.sortBy === "manual"
      ? partial.sortBy
      : d.sortBy;
  const sortOrder =
    partial.sortOrder === "asc" || partial.sortOrder === "desc"
      ? partial.sortOrder
      : d.sortOrder;
  const maxPerLevel =
    typeof partial.maxPerLevel === "number" &&
    Number.isFinite(partial.maxPerLevel)
      ? clampSidebarMaxPerLevel(partial.maxPerLevel)
      : d.maxPerLevel;
  return { viewMode, sortBy, sortOrder, maxPerLevel };
}

/** Normalize partial JSON (e.g. from scoped `kb_settings` row `kb.sidebar_article_tree.defaults`) onto code defaults. */
export function mergeKbSidebarArticleTreePrefs(
  partial: Partial<KbSidebarArticleTreePrefs> | null | undefined
): KbSidebarArticleTreePrefs {
  return mergeKbSidebarArticleTreePrefsWithBase(
    partial,
    KB_SIDEBAR_ARTICLE_TREE_DEFAULTS
  );
}

/** Merge per-user localStorage overrides on top of KB-level defaults. */
export function mergeKbSidebarArticleTreeUserPrefs(
  userPartial: Partial<KbSidebarArticleTreePrefs> | null | undefined,
  kbDefaults: KbSidebarArticleTreePrefs
): KbSidebarArticleTreePrefs {
  return mergeKbSidebarArticleTreePrefsWithBase(userPartial, kbDefaults);
}

export interface KbSidebarCategoryExpansionPrefs {
  collapsed: string[];
  expanded: string[];
}

export const KB_SIDEBAR_CATEGORY_EXPANSION_DEFAULTS: KbSidebarCategoryExpansionPrefs =
  { collapsed: [], expanded: [] };

export function parsKbSidebarCategoryExpansionPrefs(
  raw: string | null
): KbSidebarCategoryExpansionPrefs {
  if (!raw) {
    return { ...KB_SIDEBAR_CATEGORY_EXPANSION_DEFAULTS };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...KB_SIDEBAR_CATEGORY_EXPANSION_DEFAULTS };
    }
    const p = parsed as Record<string, unknown>;
    const collapsed = Array.isArray(p.collapsed)
      ? (p.collapsed as unknown[]).filter(
          (x): x is string => typeof x === "string"
        )
      : [];
    const expanded = Array.isArray(p.expanded)
      ? (p.expanded as unknown[]).filter(
          (x): x is string => typeof x === "string"
        )
      : [];
    return { collapsed, expanded };
  } catch {
    return { ...KB_SIDEBAR_CATEGORY_EXPANSION_DEFAULTS };
  }
}

export function parseKbSidebarArticleTreeDefaultsFromRow(
  raw: unknown
): KbSidebarArticleTreePrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return mergeKbSidebarArticleTreePrefs(null);
  }
  const parsed = kbSidebarArticleTreePrefsPartialSchema.safeParse(raw);
  if (!parsed.success) {
    return mergeKbSidebarArticleTreePrefs(null);
  }
  return mergeKbSidebarArticleTreePrefs(parsed.data);
}
