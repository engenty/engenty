import type { KbCategory, KbCover } from "../../src/schema/types.js";
import { resolveKbInheritedCoverFromData } from "../../src/services/kb-effective-cover.js";

/** Client-side mirror of {@link resolveKbInheritedCoverForArticle}. */
export function resolveKbInheritedCoverClient(
  categories: KbCategory[],
  articleCategoryId: string
): KbCover | null {
  return resolveKbInheritedCoverFromData(categories, articleCategoryId);
}
