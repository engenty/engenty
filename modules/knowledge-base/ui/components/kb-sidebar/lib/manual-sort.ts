import type { Article } from "../../../../src/schema/types.js";

/** Same ordering as sidebar `articleCompare` for `sortBy === "manual"`. */
export function compareManualSiblings(
  a: Article,
  b: Article,
  sortOrder: "asc" | "desc"
): number {
  const sign = sortOrder === "asc" ? 1 : -1;
  const mo = a.sort_order - b.sort_order;
  if (mo !== 0) {
    return sign * mo;
  }
  return sign * a.title.localeCompare(b.title);
}

/** `bucket`: same effective parent within the loaded set (folder tree). `flat` = all in category (list view). */
export type ManualSortSiblingScope = "bucket" | "flat";

export interface ManualSortCategoryBucket {
  categoryId: string;
  categoryIdsInKb: ReadonlySet<string>;
  defaultCategoryId: string | null;
}

export interface ManualSortSiblingOptions {
  categoryBucket?: ManualSortCategoryBucket;
  scope?: ManualSortSiblingScope;
}

function articleInCategoryBucket(
  article: Article,
  bucket: ManualSortCategoryBucket
): boolean {
  const raw = article.category_id;
  const effective =
    raw && bucket.categoryIdsInKb.has(raw) ? raw : bucket.defaultCategoryId;
  return effective === bucket.categoryId;
}

/**
 * Articles that share manual order scope with `article`:
 * - `bucket`: same effective parent within the loaded set (folder tree).
 * - `flat`: all loaded articles in the same category bucket (list view).
 */
export function getManualSortSiblings(
  article: Article,
  allArticles: Article[],
  sortOrder: "asc" | "desc" = "asc",
  scopeOrOptions: ManualSortSiblingScope | ManualSortSiblingOptions = "bucket"
): Article[] {
  const options: ManualSortSiblingOptions =
    typeof scopeOrOptions === "string"
      ? { scope: scopeOrOptions }
      : scopeOrOptions;
  const scope = options.scope ?? "bucket";

  const categoryFilter = (a: Article): boolean =>
    options.categoryBucket
      ? articleInCategoryBucket(a, options.categoryBucket)
      : true;

  if (scope === "flat") {
    return [...allArticles]
      .filter(categoryFilter)
      .sort((a, b) => compareManualSiblings(a, b, sortOrder));
  }

  const ids = new Set(allArticles.map((x) => x.id));
  const effectiveParent = (a: Article): string | null =>
    a.parent_article_id && ids.has(a.parent_article_id)
      ? a.parent_article_id
      : null;
  const targetParent = effectiveParent(article);
  return allArticles
    .filter((a) => categoryFilter(a) && effectiveParent(a) === targetParent)
    .sort((a, b) => compareManualSiblings(a, b, sortOrder));
}
