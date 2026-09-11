/**
 * Shared article header: parent chain + title (properties live below in detail).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Check, FilePenLine, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Article } from "../../src/schema/types.js";
import { kbArticlePath } from "../kb-paths.js";
import { resolveArticleLifecycleIndicator } from "../lib/article-lifecycle-indicator.js";
import {
  kbArticlePageTitleClassName,
  kbArticlePageTitleInputResetClassName,
} from "../lib/article-page-shell.js";
import { ArticleLifecycleBadgeMenu } from "./article-lifecycle-menu.js";

/** Space for the lifecycle badge when it sits in the title left gutter (md+). */
const kbArticleTitleLifecycleGutterClassName =
  "md:-left-10 md:top-1 md:absolute";

export interface ArticleHeaderChromeProps {
  /** When omitted (e.g. new article), provide `titleEdit` and optional `parentChainOverride`. */
  article?: Article;
  /** Replaces `article.parent_chain` for nav (e.g. new article with `?parent=`). */
  parentChainOverride?: Array<{ id: string; title: string }>;
  /** Light text when rendered over an inherited category cover band. */
  surface?: "default" | "on-cover";
  /** Template binding topline (article edit). Renders above the title. */
  templateTopline?: ReactNode;
  /** Inline title editor (article edit) — same visual weight as the detail `h1`. */
  titleEdit?: {
    onChange: (value: string) => void;
    placeholder?: string;
    value: string;
  };
}

function LifecycleTitleBadge({
  article,
}: {
  article: Pick<Article, "locked_at" | "status">;
}) {
  const { t } = useTranslation("kb");
  const indicator = resolveArticleLifecycleIndicator(article);
  const Icon =
    indicator.kind === "locked"
      ? Lock
      : indicator.kind === "approved"
        ? Check
        : FilePenLine;

  return (
    <span
      aria-label={t(`article.lifecycle.${indicator.kind}`)}
      className={indicator.detailBadgeClassName}
      role="img"
      title={t(`article.lifecycle.${indicator.kind}`)}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
    </span>
  );
}

export function ArticleHeaderChrome({
  article,
  parentChainOverride,
  templateTopline,
  titleEdit,
  surface = "default",
}: ArticleHeaderChromeProps) {
  const onCover = surface === "on-cover";
  const { t } = useTranslation("kb");
  const chain = parentChainOverride ?? article?.parent_chain ?? [];
  const lifecycle =
    article && !titleEdit ? resolveArticleLifecycleIndicator(article) : null;

  return (
    <div
      className={cn(
        "space-y-4",
        onCover && "drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
      )}
    >
      {chain.length > 0 ? (
        <nav
          aria-label="Parent articles"
          className="flex flex-wrap gap-x-2 gap-y-1"
        >
          {chain.map((p, i) => (
            <span
              className={cn(
                "flex items-center gap-2 text-xs",
                onCover ? "text-white/70" : "text-muted-foreground"
              )}
              key={p.id}
            >
              {i > 0 ? <span aria-hidden>/</span> : null}
              <Link
                className={cn(
                  "max-w-[200px] truncate text-left hover:underline",
                  onCover ? "hover:text-white" : "hover:text-foreground"
                )}
                to={kbArticlePath(p.id)}
              >
                {p.title}
              </Link>
            </span>
          ))}
        </nav>
      ) : null}

      <div className={cn(templateTopline && "space-y-1")}>
        {templateTopline ? (
          <div className="min-w-0">{templateTopline}</div>
        ) : null}

        <div
          className={cn(
            "relative flex min-w-0 items-start",
            lifecycle ? "gap-3 md:gap-0" : undefined
          )}
        >
          {lifecycle && article ? (
            <div
              className={cn("shrink-0", kbArticleTitleLifecycleGutterClassName)}
            >
              <ArticleLifecycleBadgeMenu
                article={article}
                badge={<LifecycleTitleBadge article={article} />}
              />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            {titleEdit ? (
              <input
                className={cn(
                  kbArticlePageTitleInputResetClassName,
                  kbArticlePageTitleClassName
                )}
                onChange={(e) => titleEdit.onChange(e.target.value)}
                placeholder={titleEdit.placeholder}
                value={titleEdit.value}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1
                  className={cn(
                    kbArticlePageTitleClassName,
                    onCover && "text-white"
                  )}
                >
                  {article?.title ?? ""}
                </h1>
                {lifecycle?.showLockedLabel ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-sm",
                      onCover ? "text-white/80" : "text-muted-foreground"
                    )}
                  >
                    <Lock aria-hidden className="h-3.5 w-3.5" />
                    {t("article.lifecycle.locked_label")}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
