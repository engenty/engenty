import { cn } from "@engenty/ui-core";
import type { Article } from "../../src/schema/types.js";
import { kbFlatRowTitleClass } from "../lib/kb-flat-list-styles.js";
import { KbArticleCommentCountChip } from "./kb-article-comment-count-chip.js";

export function KbArticleFlatRowTitle({
  article,
  className,
  titleClassName,
}: {
  article: Pick<Article, "comment_count" | "status" | "title">;
  className?: string;
  /** Defaults to flat list title; pass `kbFlatTileTitleClass` for grid tiles. */
  titleClassName?: string;
}) {
  const isDraft = article.status === "draft";
  const commentCount = article.comment_count ?? 0;

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-1.5", className)}>
      <span
        className={cn(
          titleClassName ?? kbFlatRowTitleClass,
          "min-w-0 truncate",
          isDraft && "text-muted-foreground"
        )}
      >
        {article.title}
      </span>
      <KbArticleCommentCountChip count={commentCount} />
    </div>
  );
}
