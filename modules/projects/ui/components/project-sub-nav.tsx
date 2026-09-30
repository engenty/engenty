import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, TabsList, TabsTrigger } from "@engenty/ui-core";
import { Plus } from "lucide-react";
import type { ProjectTabMeta } from "../hooks/use-project-tabs.js";

/**
 * Project detail section tabs + the "configure tabs" trigger. Renders into the
 * page-level `Tabs` context, so the active tab and changes are owned by the page
 * (used as the `DetailPageHeader` belowStrip slot).
 */
export function ProjectSubNav({
  visibleTabs,
  onConfigureClick,
  onCover = false,
}: {
  visibleTabs: ProjectTabMeta[];
  onConfigureClick: () => void;
  /** On a cover: the band sets the text colour (dark or white), not the theme. */
  onCover?: boolean;
}) {
  const { t } = useTranslation("projects");

  const trailing = (
    <Button
      aria-label={t("detail.tabs.configure")}
      className={cn(
        "ml-1 h-8 w-8",
        onCover && "text-inherit hover:bg-current/15 hover:text-inherit"
      )}
      onClick={onConfigureClick}
      size="icon"
      variant="ghost"
    >
      <Plus className="h-4 w-4" />
    </Button>
  );

  return (
    <TabsList
      className={cn(
        "h-auto w-fit border-0 bg-transparent p-0",
        onCover ? "text-inherit" : "-mb-px"
      )}
      trailing={trailing}
      variant="line"
    >
      {visibleTabs.map((tab) => (
        <TabsTrigger
          className={
            onCover
              ? "text-inherit! opacity-75 hover:opacity-100 data-active:text-inherit! data-active:opacity-100"
              : undefined
          }
          key={tab.id}
          value={tab.id}
        >
          {tab.label ?? (tab.labelKey ? t(tab.labelKey) : tab.id)}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
