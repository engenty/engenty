import { useTranslation } from "@engenty/i18n/ui";
import { Button, TabsList, TabsTrigger } from "@engenty/ui-core";
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
}: {
  visibleTabs: ProjectTabMeta[];
  onConfigureClick: () => void;
}) {
  const { t } = useTranslation("projects");

  const trailing = (
    <Button
      aria-label={t("detail.tabs.configure")}
      className="ml-1 h-8 w-8"
      onClick={onConfigureClick}
      size="icon"
      variant="ghost"
    >
      <Plus className="h-4 w-4" />
    </Button>
  );

  return (
    <TabsList
      className="-mb-px h-auto w-fit border-0 bg-transparent p-0"
      trailing={trailing}
      variant="line"
    >
      {visibleTabs.map((tab) => (
        <TabsTrigger key={tab.id} value={tab.id}>
          {tab.label ?? (tab.labelKey ? t(tab.labelKey) : tab.id)}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
