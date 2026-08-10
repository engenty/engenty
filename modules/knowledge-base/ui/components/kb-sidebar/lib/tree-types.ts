import type { Article } from "../../../../src/schema/types.js";

export interface ArticleNode {
  article: Article;
  children: ArticleNode[];
}
