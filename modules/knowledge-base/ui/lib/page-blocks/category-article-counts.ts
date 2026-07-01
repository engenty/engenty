import type { KbCategory } from "../../../src/schema/types.js";
import { descendantCategoryIds } from "./resolve-categories-for-block.js";

export interface CategoryArticleCounts {
  direct: number;
  recursive: number;
}

export function computeCategoryArticleCounts(
  categoryId: string,
  categories: KbCategory[],
  articleCategoryIds: string[]
): CategoryArticleCounts {
  const direct = articleCategoryIds.filter((id) => id === categoryId).length;
  const subtree = descendantCategoryIds(categoryId, categories);
  const recursive = articleCategoryIds.filter((id) => subtree.has(id)).length;
  return { direct, recursive };
}

export function buildArticleCategoryIdIndex(
  articles: { category_id: string }[]
): string[] {
  return articles.map((a) => a.category_id);
}
