import type { Cover } from "@engenty/covers";
import type { KbCategory } from "../../src/schema/types.js";
import { resolveKbInheritedCoverFromData } from "../../src/services/kb-effective-cover.js";

/** Client-side mirror of {@link resolveKbInheritedCoverForArticle}. */
export function resolveKbInheritedCoverClient(
  categories: KbCategory[],
  articleCategoryId: string
): Cover | null {
  return resolveKbInheritedCoverFromData(categories, articleCategoryId);
}
