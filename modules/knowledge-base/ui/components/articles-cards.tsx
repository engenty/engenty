import { useTranslation } from "@engenty/i18n/ui";
import { cn, focusVisibleRingOffset } from "@engenty/ui-core";
import type { Article } from "../../src/schema/types.js";
import { articleCardsGridWrapperClassName } from "../lib/article-cards-grid.js";
import { articleStatusPillClassName } from "../lib/article-status-pill.js";

type TableSize = "compact" | "normal";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

interface ArticlesCardsProps {
  articles: Article[];
  onCardClick: (article: Article) => void;
  tableSize: TableSize;
}

export function ArticlesCards({
  articles,
  tableSize,
  onCardClick,
}: ArticlesCardsProps) {
  const { t } = useTranslation("kb");

  return (
    <div className={articleCardsGridWrapperClassName(tableSize)}>
      {articles.map((article) => (
        <button
          className={cn(
            "ui-canvas-panel flex h-full min-h-0 flex-col items-stretch justify-start rounded-lg border-0 bg-card text-left outline-none transition-colors hover:bg-accent/30",
            focusVisibleRingOffset,
            tableSize === "compact" ? "gap-1.5 p-3" : "gap-2 p-4"
          )}
          key={article.id}
          onClick={() => onCardClick(article)}
          type="button"
        >
          <div className="flex w-full min-w-0 items-start justify-between gap-3">
            <p className="min-w-0 flex-1 font-medium leading-snug">
              {article.title}
            </p>
            <span className={articleStatusPillClassName(article.status)}>
              {t(`article.status.${article.status}`)}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            {t("columns.updated_at")}: {formatDate(article.updated_at)}
          </p>
        </button>
      ))}
    </div>
  );
}
