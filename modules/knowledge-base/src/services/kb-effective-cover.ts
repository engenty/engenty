import type { KbRepoFactory } from "../dal/contracts.js";
import {
  type KbCoverInheritance,
  normalizeKbCoverInheritance,
} from "../schema/categories.js";
import type { KbCategory, KbCover } from "../schema/types.js";

interface ArticleLike {
  category_id: string;
  kb_id: string;
}

function isCategoryOrDescendant(
  byId: Map<string, KbCategory>,
  categoryId: string,
  ancestorId: string
): boolean {
  if (categoryId === ancestorId) {
    return true;
  }
  let current = byId.get(categoryId) ?? null;
  const seen = new Set<string>();
  while (current?.parent_id) {
    if (seen.has(current.id)) {
      break;
    }
    seen.add(current.id);
    if (current.parent_id === ancestorId) {
      return true;
    }
    current = byId.get(current.parent_id) ?? null;
  }
  return false;
}

function categoryCoverAppliesToArticle(
  inheritance: KbCoverInheritance,
  categoryId: string,
  articleCategoryId: string,
  byId: Map<string, KbCategory>
): boolean {
  if (inheritance === "none") {
    return false;
  }
  if (inheritance === "direct_articles") {
    return articleCategoryId === categoryId;
  }
  return isCategoryOrDescendant(byId, articleCategoryId, categoryId);
}

/** Nearest ancestor (starting at the article category) with an applicable inherited cover. */
export function resolveKbInheritedCoverFromData(
  categories: KbCategory[],
  articleCategoryId: string
): KbCover | null {
  const byId = new Map(categories.map((row) => [row.id, row]));
  let current = byId.get(articleCategoryId) ?? null;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) {
      break;
    }
    seen.add(current.id);
    const inheritance = normalizeKbCoverInheritance(current.cover_inheritance);
    if (
      current.cover &&
      categoryCoverAppliesToArticle(
        inheritance,
        current.id,
        articleCategoryId,
        byId
      )
    ) {
      return current.cover;
    }
    current = current.parent_id ? (byId.get(current.parent_id) ?? null) : null;
  }
  return null;
}

export async function resolveKbInheritedCoverForArticle(
  repos: Pick<KbRepoFactory, "categories">,
  article: ArticleLike
): Promise<KbCover | null> {
  const categories = await repos.categories.list(article.kb_id);
  return resolveKbInheritedCoverFromData(categories, article.category_id);
}
