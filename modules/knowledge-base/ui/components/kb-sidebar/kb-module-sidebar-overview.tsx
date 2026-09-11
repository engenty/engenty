/**
 * Secondary column body while the space has no knowledge base yet. Once one
 * exists the article tree replaces this; there is nothing to choose between.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  SidebarContent,
  Skeleton,
  sidebarColumnContentInsetClassName,
} from "@engenty/ui-core";
import { useKbsQuery } from "../../queries.js";

export function KbModuleSidebarOverview() {
  const { t } = useTranslation("kb");
  const { isLoading } = useKbsQuery();

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
        ) : (
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
        )}
      </SidebarContent>
    </div>
  );
}
