import type { Article, KbCategory } from "../../src/schema/types.js";

/** Effective category bucket for sidebar tree grouping (matches category-forest). */
export function resolveArticleCategoryId(
  article: Article,
  categoriesById: ReadonlyMap<string, KbCategory>,
  defaultCategoryId: string | null
): string | null {
  if (article.category_id && categoriesById.has(article.category_id)) {
    return article.category_id;
  }
  return defaultCategoryId;
}

/** Folder categories allow drag reorder only when sort is manual (`sort_order`). */
export function isCategoryArticleReorderable(category: KbCategory): boolean {
  return (
    category.view_type === "folder" &&
    category.page_settings.collection.sort_by === "sort_order"
  );
}

export function compareArticlesForCategory(
  a: Article,
  b: Article,
  category: KbCategory
): number {
  const sortBy = category.page_settings.collection.sort_by;

  switch (sortBy) {
    case "sort_order": {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return a.title.localeCompare(b.title);
    }
    case "created_at": {
      const ca = new Date(a.created_at).getTime();
      const cb = new Date(b.created_at).getTime();
      if (ca !== cb) {
        return cb - ca;
      }
      return a.title.localeCompare(b.title);
    }
    case "updated_at": {
      const ua = new Date(a.updated_at).getTime();
      const ub = new Date(b.updated_at).getTime();
      if (ua !== ub) {
        return ub - ua;
      }
      return a.title.localeCompare(b.title);
    }
    case "name":
      return a.title.localeCompare(b.title);
    default: {
      if (sortBy.startsWith("custom:")) {
        const key = sortBy.slice("custom:".length);
        const av = String(a.custom_properties[key] ?? "");
        const bv = String(b.custom_properties[key] ?? "");
        const cmp = av.localeCompare(bv);
        if (cmp !== 0) {
          return cmp;
        }
        return a.title.localeCompare(b.title);
      }
      return a.sort_order - b.sort_order;
    }
  }
}
