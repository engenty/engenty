/**
 * Build the combined category + article forest used by the sidebar folder
 * mode. Categories nest first via `parent_id`; each leaf category renders
 * the articles that belong to it (matched on `category_id`). Articles still
 * keep their parent_article_id sub-tree so the page hierarchy is preserved
 * underneath each category. Articles whose `category_id` references an
 * unknown row fall through to the KB's default `general` category so the
 * sidebar never silently drops a page.
 */

import type { Article, KbCategory } from "../../../../src/schema/types.js";
import { compareArticlesForCategory } from "../../../lib/category-sidebar-sort.js";
import type { ArticleNode } from "../lib/tree-types.js";
import type { CategoryNode } from "./category-tree-rows.js";

export interface CategoryForestParams {
  articles: Article[];
  categories: KbCategory[];
  defaultCategoryId: string | null;
}

export function buildCategoryArticleForest(
  params: CategoryForestParams
): CategoryNode[] {
  const { articles, categories, defaultCategoryId } = params;
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const categoriesByParent = new Map<string | null, KbCategory[]>();
  for (const c of categories) {
    const list = categoriesByParent.get(c.parent_id) ?? [];
    list.push(c);
    categoriesByParent.set(c.parent_id, list);
  }

  // Articles bucketed by effective category id.
  const articlesByCategory = new Map<string, Article[]>();
  for (const article of articles) {
    const fallback =
      defaultCategoryId && !categoriesById.has(article.category_id)
        ? defaultCategoryId
        : article.category_id;
    const list = articlesByCategory.get(fallback) ?? [];
    list.push(article);
    articlesByCategory.set(fallback, list);
  }

  function buildArticleTreeForBucket(
    bucket: Article[],
    category: KbCategory
  ): ArticleNode[] {
    const inBucket = new Set(bucket.map((a) => a.id));
    const byParent = new Map<string | null, Article[]>();
    for (const article of bucket) {
      const pid = article.parent_article_id;
      const effectiveParent = pid && inBucket.has(pid) ? pid : null;
      const list = byParent.get(effectiveParent) ?? [];
      list.push(article);
      byParent.set(effectiveParent, list);
    }

    function toNodes(parentKey: string | null): ArticleNode[] {
      const rows = byParent.get(parentKey) ?? [];
      const sorted = [...rows].sort((a, b) =>
        compareArticlesForCategory(a, b, category)
      );
      return sorted.map((article) => ({
        article,
        children: toNodes(article.id),
      }));
    }

    return toNodes(null);
  }

  function buildCategoryNodes(parentId: string | null): CategoryNode[] {
    const rows = categoriesByParent.get(parentId) ?? [];
    const sorted = [...rows].sort((a, b) => {
      // Default category always first; then sort_order, then name.
      if (a.is_default && !b.is_default) {
        return -1;
      }
      if (!a.is_default && b.is_default) {
        return 1;
      }
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return a.name.localeCompare(b.name);
    });
    return sorted.map((category) => ({
      category,
      children: buildCategoryNodes(category.id),
      articles: buildArticleTreeForBucket(
        articlesByCategory.get(category.id) ?? [],
        category
      ),
    }));
  }

  return buildCategoryNodes(null);
}

/** Filter the combined forest for typed search query (matches category + article titles). */
export function filterCategoryForest(
  forest: CategoryNode[],
  q: string
): CategoryNode[] {
  if (!q) {
    return forest;
  }
  const query = q.toLowerCase();

  function filterArticles(nodes: ArticleNode[]): ArticleNode[] {
    const out: ArticleNode[] = [];
    for (const n of nodes) {
      const kept = filterArticles(n.children);
      const matchSelf = n.article.title.toLowerCase().includes(query);
      if (matchSelf || kept.length > 0) {
        out.push({ article: n.article, children: kept });
      }
    }
    return out;
  }

  function walk(nodes: CategoryNode[]): CategoryNode[] {
    const out: CategoryNode[] = [];
    for (const n of nodes) {
      const childMatches = walk(n.children);
      const articleMatches = filterArticles(n.articles);
      const selfMatches = n.category.name.toLowerCase().includes(query);
      if (selfMatches || childMatches.length > 0 || articleMatches.length > 0) {
        out.push({
          category: n.category,
          children: childMatches,
          // When category itself matches we keep all its articles.
          articles: selfMatches ? n.articles : articleMatches,
        });
      }
    }
    return out;
  }

  return walk(forest);
}

/** True when the forest contains at least one matching row for the query. */
export function categoryForestHasMatch(
  forest: CategoryNode[],
  q: string
): boolean {
  if (!q) {
    return forest.length > 0;
  }
  return forest.length > 0;
}

/** All category ids that have any nested content (for "expand all"). */
export function collectCategoryIdsWithContent(
  forest: CategoryNode[]
): string[] {
  const out: string[] = [];
  function walk(nodes: CategoryNode[]) {
    for (const n of nodes) {
      if (n.children.length > 0 || n.articles.length > 0) {
        out.push(n.category.id);
        walk(n.children);
      }
    }
  }
  walk(forest);
  return out;
}
