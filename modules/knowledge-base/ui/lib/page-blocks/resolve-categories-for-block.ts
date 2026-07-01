import type {
  KbCategoriesBlockScope,
  KbPageBlockSort,
  KbPageCategoriesBlock,
} from "../../../src/schema/page-blocks.js";
import type { KbCategory } from "../../../src/schema/types.js";

export interface KbPageBlockCategoryContext {
  categories: KbCategory[];
  /** Hub: null. Category page: current category id. */
  parentCategoryId: string | null;
}

function sortCategories(
  rows: KbCategory[],
  sort: KbPageBlockSort
): KbCategory[] {
  const copy = [...rows];
  if (sort === "name_asc") {
    return copy.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (sort === "created_at") {
    return copy.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
  return copy.sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.name.localeCompare(b.name);
  });
}

export function resolveCategoriesForBlock(
  block: KbPageCategoriesBlock,
  ctx: KbPageBlockCategoryContext
): KbCategory[] {
  const { categories, parentCategoryId } = ctx;

  if (block.scope === "manual") {
    const idSet = new Set(block.manual_category_ids);
    return sortCategories(
      categories.filter((c) => idSet.has(c.id)),
      block.sort
    );
  }

  const direct = categories.filter((c) =>
    parentCategoryId === null
      ? c.parent_id === null
      : c.parent_id === parentCategoryId
  );

  if (block.scope === "direct_children") {
    return sortCategories(direct, block.sort);
  }

  // direct_plus_one: direct children + their immediate children
  const directIds = new Set(direct.map((c) => c.id));
  const plusOne = categories.filter(
    (c) =>
      directIds.has(c.id) ||
      (c.parent_id !== null && directIds.has(c.parent_id))
  );
  return sortCategories(plusOne, block.sort);
}

export function descendantCategoryIds(
  rootId: string,
  all: KbCategory[]
): Set<string> {
  const result = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const cat of all) {
      if (cat.parent_id && result.has(cat.parent_id) && !result.has(cat.id)) {
        result.add(cat.id);
        added = true;
      }
    }
  }
  return result;
}

export function scopeLabel(scope: KbCategoriesBlockScope): string {
  switch (scope) {
    case "direct_children":
      return "direct_children";
    case "direct_plus_one":
      return "direct_plus_one";
    case "manual":
      return "manual";
    default:
      return scope;
  }
}
