import type { KbPageArticlesBlock } from "../../../src/schema/page-blocks.js";
import type { Article, KbCategory } from "../../../src/schema/types.js";
import { descendantCategoryIds } from "./resolve-categories-for-block.js";

export interface ResolveArticlesInput {
  allArticles: Article[];
  block: KbPageArticlesBlock;
  categories: KbCategory[];
  /** Category page context — when set, scopes direct/recursive to this subtree. */
  categoryId?: string;
}

function filterDrafts(articles: Article[], includeDrafts: boolean): Article[] {
  if (includeDrafts) {
    return articles;
  }
  return articles.filter((a) => a.status !== "draft");
}

function sortArticles(
  articles: Article[],
  sortBy: KbPageArticlesBlock["sort_by"]
): Article[] {
  const copy = [...articles];
  if (sortBy === "name") {
    return copy.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sortBy === "created_at") {
    return copy.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
  if (sortBy === "updated_at") {
    return copy.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }
  if (sortBy.startsWith("custom:")) {
    const key = sortBy.slice("custom:".length);
    return copy.sort((a, b) => {
      const av = a.custom_properties?.[key];
      const bv = b.custom_properties?.[key];
      return String(av ?? "").localeCompare(String(bv ?? ""));
    });
  }
  return copy.sort((a, b) => a.sort_order - b.sort_order);
}

export function resolveArticlesForBlock({
  block,
  allArticles,
  categories,
  categoryId,
}: ResolveArticlesInput): Article[] {
  const filtered = filterDrafts(allArticles, block.include_drafts);

  if (block.source === "manual_pick") {
    const byId = new Map(filtered.map((a) => [a.id, a]));
    const ordered: Article[] = [];
    for (const id of block.manual_article_ids) {
      const row = byId.get(id);
      if (row) {
        ordered.push(row);
      }
    }
    return ordered.slice(0, block.max_items);
  }

  const isRecursive =
    block.source === "latest_created_recursive" ||
    block.source === "recent_updated_recursive";

  let scoped = filtered;
  if (categoryId) {
    if (isRecursive) {
      const ids = descendantCategoryIds(categoryId, categories);
      scoped = filtered.filter((a) => ids.has(a.category_id));
    } else {
      scoped = filtered.filter((a) => a.category_id === categoryId);
    }
  } else if (isRecursive) {
    // Hub: all KB articles already in scope
    scoped = filtered;
  }

  let sorted: Article[];
  if (
    block.source === "latest_created" ||
    block.source === "latest_created_recursive"
  ) {
    sorted = sortArticles(scoped, "created_at");
  } else if (
    block.source === "recent_updated" ||
    block.source === "recent_updated_recursive"
  ) {
    sorted = sortArticles(scoped, "updated_at");
  } else if (block.source === "grouped_by_category") {
    sorted = sortArticles(scoped, block.sort_by);
  } else {
    sorted = sortArticles(scoped, block.sort_by);
  }

  return sorted.slice(0, block.max_items);
}

export interface ArticlesByCategoryGroup {
  articles: Article[];
  category: KbCategory | null;
}

export function groupArticlesByCategory(
  articles: Article[],
  categories: KbCategory[]
): ArticlesByCategoryGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const groups = new Map<string, Article[]>();
  for (const article of articles) {
    const key = article.category_id;
    const list = groups.get(key) ?? [];
    list.push(article);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([categoryId, rows]) => ({
    category: byId.get(categoryId) ?? null,
    articles: rows,
  }));
}
