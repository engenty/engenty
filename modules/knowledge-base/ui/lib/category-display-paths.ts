/**
 * Shared helper: turn a flat KbCategory[] into a list decorated with a
 * "Parent / Child / Leaf" display path. Used by the article properties panel
 * category editor and by the sidebar quick-create dialog so users always see
 * categories in the same hierarchical form.
 */

import type { KbCategory } from "../../src/schema/types.js";
import { kbCategoryPath, kbHubPath } from "../kb-paths.js";
import { truncateKbBreadcrumbSegment } from "./kb-breadcrumb-truncate.js";

export interface CategoryWithPath extends KbCategory {
  /** Display path for nested categories ("Parent / Child / Leaf"). */
  display_path: string;
}

export interface KbBreadcrumbCrumb {
  label: string;
  menuLabel?: string;
  to?: string;
  tooltip?: string;
}

/** Ancestors from root → parent (excludes `category` itself). */
export function buildCategoryAncestorChain(
  category: KbCategory,
  categories: KbCategory[]
): KbCategory[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const chain: KbCategory[] = [];
  let cursor: string | null = category.parent_id;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    const parent = byId.get(cursor);
    if (!parent) {
      break;
    }
    chain.unshift(parent);
    seen.add(cursor);
    cursor = parent.parent_id;
  }
  return chain;
}

export function categoryBreadcrumbPath(category: KbCategory): string {
  if (category.is_default) {
    return kbHubPath();
  }
  return kbCategoryPath(category.slug);
}

export function categoryToBreadcrumbCrumb(
  category: KbCategory,
  options?: { link?: boolean }
): KbBreadcrumbCrumb {
  const seg = truncateKbBreadcrumbSegment(category.name);
  const link = options?.link !== false;
  return {
    label: seg.label,
    menuLabel: category.name,
    ...(seg.tooltip ? { tooltip: seg.tooltip } : {}),
    ...(link ? { to: categoryBreadcrumbPath(category) } : {}),
  };
}

/** Category folder chain for shell breadcrumbs (skips default/general bucket). */
export function buildCategoryTreeBreadcrumbCrumbs(
  category: KbCategory,
  categories: KbCategory[],
  options?: { linkAncestors?: boolean; linkCurrent?: boolean }
): KbBreadcrumbCrumb[] {
  if (category.is_default) {
    return [];
  }
  const ancestors = buildCategoryAncestorChain(category, categories);
  const linkAncestors = options?.linkAncestors !== false;
  const linkCurrent = options?.linkCurrent === true;
  return [
    ...ancestors.map((cat) =>
      categoryToBreadcrumbCrumb(cat, { link: linkAncestors })
    ),
    categoryToBreadcrumbCrumb(category, { link: linkCurrent }),
  ];
}

export function resolveArticleCategory(
  categoryId: string | null | undefined,
  categories: KbCategory[],
  defaultCategoryId: string | null
): KbCategory | null {
  const byId = new Map(categories.map((c) => [c.id, c]));
  if (categoryId && byId.has(categoryId)) {
    return byId.get(categoryId) ?? null;
  }
  if (defaultCategoryId && byId.has(defaultCategoryId)) {
    return byId.get(defaultCategoryId) ?? null;
  }
  return null;
}

export function buildCategoryDisplayPaths(
  categories: KbCategory[]
): CategoryWithPath[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return categories.map((c) => {
    const segments: string[] = [c.name];
    let cursor: string | null = c.parent_id;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      const parent = byId.get(cursor);
      if (!parent) {
        break;
      }
      segments.unshift(parent.name);
      seen.add(cursor);
      cursor = parent.parent_id;
    }
    return { ...c, display_path: segments.join(" / ") };
  });
}
