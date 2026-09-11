/**
 * Prev/next sibling links — placed below article body on detail view.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Article } from "../../src/schema/types.js";
import { kbArticlePath, kbHubPath } from "../kb-paths.js";

const siblingLinkClassName =
  "h-auto min-w-0 max-w-full px-2 py-1 font-normal text-muted-foreground hover:text-foreground sm:max-w-[min(24rem,55vw)]";

export function ArticleSiblingNav({ article }: { article: Article }) {
  const { t } = useTranslation("kb");
  const prev = article.prev_sibling;
  const next = article.next_sibling;
  const prevToHub = article.prev_to_kb_hub === true;

  if (!(prev || next || prevToHub)) {
    return null;
  }

  return (
    <nav
      aria-label={t("article.sibling_nav_label")}
      className="flex w-full flex-wrap items-center gap-y-1 pt-2 print:hidden"
    >
      <div className="flex min-w-0 flex-1 justify-start">
        {prev ? (
          <Button
            asChild
            className={siblingLinkClassName}
            size="sm"
            variant="ghost"
          >
            <Link to={kbArticlePath(prev.id)}>
              <ChevronLeft className="mr-0.5 h-4 w-4 shrink-0" />
              <span className="truncate">{prev.title}</span>
            </Link>
          </Button>
        ) : prevToHub ? (
          <Button
            asChild
            className={siblingLinkClassName}
            size="sm"
            variant="ghost"
          >
            <Link to={kbHubPath()}>
              <ChevronLeft className="mr-0.5 h-4 w-4 shrink-0" />
              <span className="truncate">{t("breadcrumb.home")}</span>
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 justify-end">
        {next ? (
          <Button
            asChild
            className={siblingLinkClassName}
            size="sm"
            variant="ghost"
          >
            <Link to={kbArticlePath(next.id)}>
              <span className="truncate">{next.title}</span>
              <ChevronRight className="ml-0.5 h-4 w-4 shrink-0" />
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
