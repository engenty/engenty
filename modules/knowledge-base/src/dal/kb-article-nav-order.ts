/**
 * Reading-order navigation for KB articles — pre-order within the article
 * forest (parent_article_id within the KB), matching sidebar folder mode.
 */

export interface KbNavArticleRow {
  id: string;
  parent_article_id: string | null;
  slug: string;
  sort_order: number;
  title: string;
}

interface ArticleNode {
  article: KbNavArticleRow;
  children: ArticleNode[];
}

function sortArticlesStable(a: KbNavArticleRow, b: KbNavArticleRow): number {
  const o = a.sort_order - b.sort_order;
  if (o !== 0) {
    return o;
  }
  return a.title.localeCompare(b.title);
}

function buildArticleForest(bucketArticles: KbNavArticleRow[]): ArticleNode[] {
  const inBucket = new Set(bucketArticles.map((x) => x.id));
  const byParent = new Map<string | null, KbNavArticleRow[]>();

  for (const article of bucketArticles) {
    const pid = article.parent_article_id;
    const effectiveParent = pid && inBucket.has(pid) ? pid : null;
    const list = byParent.get(effectiveParent) ?? [];
    list.push(article);
    byParent.set(effectiveParent, list);
  }

  function toNodes(parentKey: string | null): ArticleNode[] {
    const rows = byParent.get(parentKey) ?? [];
    return [...rows].sort(sortArticlesStable).map((article) => ({
      article,
      children: toNodes(article.id),
    }));
  }

  return toNodes(null);
}

function flattenForestPreorder(
  forest: ArticleNode[]
): Array<{ id: string; title: string; slug: string }> {
  const out: Array<{ id: string; title: string; slug: string }> = [];
  const walk = (nodes: ArticleNode[]) => {
    for (const n of nodes) {
      out.push({
        id: n.article.id,
        title: n.article.title,
        slug: n.article.slug,
      });
      walk(n.children);
    }
  };
  walk(forest);
  return out;
}

/** Flat ids in the same order as the KB sidebar article list (all articles in the KB). */
export function flattenKbArticleReadingOrder(
  articles: KbNavArticleRow[]
): Array<{ id: string; title: string; slug: string }> {
  return flattenForestPreorder(buildArticleForest(articles));
}

/**
 * Ancestors of `articleId`, outermost first, read out of the KB's own rows.
 *
 * Same set the reading order is built from: an article detail already loads
 * every row in the KB, so the chain costs nothing extra. Stops at the first
 * ancestor missing from the set, and at a cycle.
 */
export function buildKbArticleParentChain(
  articles: KbNavArticleRow[],
  articleId: string
): Array<{ id: string; title: string; slug: string }> {
  const byId = new Map(articles.map((row) => [row.id, row]));
  const chain: Array<{ id: string; title: string; slug: string }> = [];
  const seen = new Set<string>([articleId]);
  let pid = byId.get(articleId)?.parent_article_id ?? null;
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const parent = byId.get(pid);
    if (!parent) {
      break;
    }
    chain.unshift({ id: parent.id, title: parent.title, slug: parent.slug });
    pid = parent.parent_article_id;
  }
  return chain;
}
