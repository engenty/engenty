/**
 * Prev/next sibling links — placed below article body on detail view.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Article } from "../../src/schema/types.js";
import { KB_MODULE_BASE, kbArticlePath, kbHubPath } from "../kb-paths.js";

export function ArticleSiblingNav({
  article,
  kbSlug,
}: {
  article: Article;
  kbSlug: string;
}) {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
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
            className="h-auto min-w-0 max-w-full px-2 py-1 font-normal text-muted-foreground hover:text-foreground sm:max-w-[min(24rem,55vw)]"
            onClick={() =>
              kbSlug
                ? navigate(kbArticlePath(kbSlug, prev.id))
                : navigate(`/mdl/knowledge-base/${prev.id}`)
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            <ChevronLeft className="mr-0.5 h-4 w-4 shrink-0" />
            <span className="truncate">{prev.title}</span>
          </Button>
        ) : prevToHub ? (
          <Button
            className="h-auto min-w-0 max-w-full px-2 py-1 font-normal text-muted-foreground hover:text-foreground sm:max-w-[min(24rem,55vw)]"
            onClick={() =>
              kbSlug ? navigate(kbHubPath(kbSlug)) : navigate(KB_MODULE_BASE)
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            <ChevronLeft className="mr-0.5 h-4 w-4 shrink-0" />
            <span className="truncate">{t("breadcrumb.home")}</span>
          </Button>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 justify-end">
        {next ? (
          <Button
            className="h-auto min-w-0 max-w-full px-2 py-1 font-normal text-muted-foreground hover:text-foreground sm:max-w-[min(24rem,55vw)]"
            onClick={() =>
              kbSlug
                ? navigate(kbArticlePath(kbSlug, next.id))
                : navigate(`/mdl/knowledge-base/${next.id}`)
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            <span className="truncate">{next.title}</span>
            <ChevronRight className="ml-0.5 h-4 w-4 shrink-0" />
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
