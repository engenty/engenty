// Line tabs in DetailPageHeader.belowStrip — switch Plan list hubs.
import { useTranslation } from "@engenty/i18n/ui";
import { TabsList, TabsTrigger } from "@engenty/ui-core";

export type PlanListTab = "tasks" | "goals" | "routines";

export function PlanListSubNav() {
  const { t } = useTranslation("tasks");

  return (
    <TabsList
      className="-mb-px h-auto w-fit border-0 bg-transparent p-0"
      variant="line"
    >
      <TabsTrigger value="tasks">{t("tabs.tasks")}</TabsTrigger>
      <TabsTrigger value="goals">{t("tabs.goals")}</TabsTrigger>
      <TabsTrigger value="routines">{t("tabs.routines")}</TabsTrigger>
    </TabsList>
  );
}
