/**
 * Secondary column body when no KB is active (new tenant or unresolved slug).
 * Does not mimic the article/FAQ tree — only a compact empty hint plus module nav.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  cn,
  SidebarContent,
  Skeleton,
  sidebarColumnContentInsetClassName,
} from "@engenty/ui-core";
import { kbsQueryOptions } from "../../queries.js";
import { KbModuleScopedNavLinks } from "../kb-module-scoped-nav-links.js";
import { KbFavoritesNavSection } from "./favorites/kb-favorites-nav-section.js";

export function KbModuleSidebarOverview() {
  const { t } = useTranslation("kb");
  const { data: kbsRaw, isLoading } = useQuery(kbsQueryOptions);
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];
  const noKbs = !isLoading && kbs.length === 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SidebarContent className="gap-0 overflow-x-hidden px-0 py-0">
        {isLoading ? (
          <div
            className={cn(
              "flex flex-col gap-2 py-2",
              sidebarColumnContentInsetClassName
            )}
          >
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : noKbs ? (
          <div
            className={cn("space-y-1 py-2", sidebarColumnContentInsetClassName)}
          >
            <p className="font-medium text-foreground text-sm">
              {t("hub.empty_title")}
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t("hub.empty_description")}
            </p>
          </div>
        ) : (
          <p
            className={cn(
              "py-2 text-muted-foreground text-xs",
              sidebarColumnContentInsetClassName
            )}
          >
            {t("sidebar.pick_kb")}
          </p>
        )}
      </SidebarContent>

      <KbFavoritesNavSection />

      <KbModuleScopedNavLinks />
    </div>
  );
}
