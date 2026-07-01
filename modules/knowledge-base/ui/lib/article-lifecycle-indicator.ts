import type { ArticleStatus } from "../../src/schema/types.js";

export type ArticleLifecycleVisual =
  | "draft"
  | "approved"
  | "locked"
  | "archived";

export interface ArticleLifecycleIndicator {
  ariaLabel: string;
  detailBadgeClassName: string;
  dotClassName: string;
  kind: ArticleLifecycleVisual;
  showLockedLabel: boolean;
}

export function resolveArticleLifecycleIndicator(article: {
  locked_at: string | null;
  status: ArticleStatus;
}): ArticleLifecycleIndicator {
  if (article.locked_at) {
    return {
      kind: "locked",
      ariaLabel: "Locked",
      dotClassName: "bg-muted-foreground/70",
      detailBadgeClassName:
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
      showLockedLabel: true,
    };
  }
  if (article.status === "published") {
    return {
      kind: "approved",
      ariaLabel: "Approved",
      dotClassName: "bg-emerald-500",
      detailBadgeClassName:
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
      showLockedLabel: false,
    };
  }
  if (article.status === "archived") {
    return {
      kind: "archived",
      ariaLabel: "Archived",
      dotClassName: "bg-muted-foreground/50",
      detailBadgeClassName:
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
      showLockedLabel: false,
    };
  }
  return {
    kind: "draft",
    ariaLabel: "Draft",
    dotClassName: "bg-amber-500/80",
    detailBadgeClassName:
      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-200",
    showLockedLabel: false,
  };
}
