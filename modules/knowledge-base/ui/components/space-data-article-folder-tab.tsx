/**
 * A parent article — the article, and the pages under it.
 *
 * An article with children is a FOLDER in the tree (Matthias, 2026-08-15), and
 * a folder's view is the host's to frame and the module's to fill. What fills
 * it here is the article itself: opening "Setup" should show Setup, not a list
 * of the four pages that happen to sit beneath it. The sub-pages follow, the
 * way a knowledge base shows a section's children under its text.
 *
 * The article's id comes from the `index.article.md` row of the host's
 * listing — a folder carries no record id of its own, which is half the reason
 * the adapter lists the parent's own file inside its folder rather than hiding
 * it.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  Spinner,
  uiCardElevatedClassName,
  uiRowHoverClassName,
} from "@engenty/ui-core";
import type { UiTabRenderProps } from "@engenty/ui-plugin-sdk";
import { ChevronRight, FileText, FolderOpen } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ARTICLE_INDEX_NAME,
  entryRows,
  folderHref,
  folderRows,
  indexArticleId,
  nodeHref,
} from "../lib/space-data-rows.js";
import { ArticleDetailPage } from "../pages/article-detail.js";

export function SpaceDataArticleFolderTab({ params }: UiTabRenderProps) {
  const { t } = useTranslation("kb");
  const { spaceKey = "" } = useParams();
  const entries = useMemo(() => entryRows(params.entries), [params.entries]);
  const folders = useMemo(() => folderRows(params.folders), [params.folders]);
  const articleId = useMemo(() => indexArticleId(entries), [entries]);
  const children = useMemo(
    () => entries.filter((entry) => entry.name !== ARTICLE_INDEX_NAME),
    [entries]
  );

  if (params.isPending === true) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {articleId ? <ArticleDetailPage articleId={articleId} embedded /> : null}
      {children.length > 0 || folders.length > 0 ? (
        <section className="flex flex-col gap-2 border-t p-6">
          <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {t("spaceData.article.subPages", { defaultValue: "Sub-pages" })}
          </h2>
          <ul
            className={cn(uiCardElevatedClassName, "divide-y overflow-hidden")}
          >
            {folders.map((folder) => (
              <li key={folder.path}>
                <Link
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 text-sm",
                    uiRowHoverClassName
                  )}
                  to={folderHref(spaceKey, folder.path)}
                >
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                </Link>
              </li>
            ))}
            {children.map((entry) => (
              <li key={entry.path}>
                <Link
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 text-sm",
                    uiRowHoverClassName
                  )}
                  to={nodeHref(spaceKey, entry.path)}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {entry.title || entry.name}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
