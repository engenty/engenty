/**
 * The knowledge base's article page, contributed to the space Data pane.
 *
 * Five lines of binding over `ArticleDetailPage`, and deliberately nothing
 * more: the pane shows the SAME viewer as `/mdl/knowledge-base/…` — the same
 * header chrome, properties, comments and actions — because a page that looks
 * one way in the knowledge base and another way in the space's tree is two
 * viewers that will drift. Only the ids differ, and those arrive as params
 * instead of from the path.
 */
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { ArticleDetailPage } from "../pages/article-detail.js";

export function SpaceDataArticleTab({ params }: UiTabRenderProps) {
  // `recordId` since Phase K: an article arrives as an ordinary space-data
  // record now, and every node surface is handed the same four params. The
  // base's slug no longer travels with it and does not need to — the viewer
  // resolves the library from the article it loads.
  const articleId = typeof params.recordId === "string" ? params.recordId : "";
  if (!articleId) {
    return null;
  }
  return <ArticleDetailPage articleId={articleId} embedded />;
}
