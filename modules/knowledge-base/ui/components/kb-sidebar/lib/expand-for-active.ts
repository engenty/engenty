import type { Article } from "../../../../src/schema/types.js";

/**
 * Article ids that must be in `articleExpanded` so nested rows under each ancestor
 * are visible down to the active article.
 */
export function collectArticleBranchIdsToReveal(
  activeArticleId: string,
  articles: Article[]
): string[] {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const active = byId.get(activeArticleId);
  if (!active) {
    return [];
  }
  const out: string[] = [];
  let pid = active.parent_article_id;
  const seen = new Set<string>();
  while (pid && byId.has(pid) && !seen.has(pid)) {
    seen.add(pid);
    out.push(pid);
    pid = byId.get(pid)!.parent_article_id;
  }
  return out;
}
