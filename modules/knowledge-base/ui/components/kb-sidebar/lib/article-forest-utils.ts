import {
  capSidebarForest,
  filterSidebarForest,
  type SidebarForest,
  sidebarForestSome,
} from "@engenty/ui-core";
import type { Article } from "../../../../src/schema/types.js";
import type { ArticleNode } from "./tree-types.js";

function articleNodesToNavForest(
  nodes: ArticleNode[]
): SidebarForest<Article>[] {
  return nodes.map((n) => ({
    item: n.article,
    children: articleNodesToNavForest(n.children),
  }));
}

function navForestToArticleNodes(
  forest: SidebarForest<Article>[]
): ArticleNode[] {
  return forest.map((n) => ({
    article: n.item,
    children: navForestToArticleNodes(n.children),
  }));
}

export function filterArticleForest(
  forest: ArticleNode[],
  q: string
): ArticleNode[] {
  if (!q) {
    return forest;
  }
  return navForestToArticleNodes(
    filterSidebarForest(articleNodesToNavForest(forest), q, (a, query) =>
      a.title.toLowerCase().includes(query)
    )
  );
}

export function capArticleForest(
  forest: ArticleNode[],
  max: number
): ArticleNode[] {
  return navForestToArticleNodes(
    capSidebarForest(articleNodesToNavForest(forest), max)
  );
}

export function forestHasMatch(forest: ArticleNode[], q: string): boolean {
  if (!q) {
    return true;
  }
  return sidebarForestSome(articleNodesToNavForest(forest), (a) =>
    a.title.toLowerCase().includes(q)
  );
}
