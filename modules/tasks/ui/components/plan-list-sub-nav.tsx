// Line tabs in DetailPageHeader.aboveStrip — switch Plan list hubs.
import { useInboxListQuery } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { TabsList, TabsTrigger } from "@engenty/ui-core";
import { useMemo } from "react";
import { countOpenHitl } from "../lib/inbox-classification.js";

export type PlanListTab = "inbox" | "tasks" | "goals" | "routines";

function TabBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span className="ml-1 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function PlanListSubNav() {
  const { t } = useTranslation("tasks");
  const inboxQuery = useInboxListQuery({ limit: 100, status: "open" });
  const hitlCount = useMemo(
    () => countOpenHitl(inboxQuery.data?.notifications ?? []),
    [inboxQuery.data?.notifications]
  );

  return (
    <TabsList
      className="-mb-px h-auto border-0 bg-transparent p-0"
      variant="line"
    >
      <TabsTrigger className="gap-0" value="inbox">
        {t("tabs.inbox")}
        <TabBadge count={hitlCount} />
      </TabsTrigger>
      <TabsTrigger value="tasks">{t("tabs.tasks")}</TabsTrigger>
      <TabsTrigger value="goals">{t("tabs.goals")}</TabsTrigger>
      <TabsTrigger value="routines">{t("tabs.routines")}</TabsTrigger>
    </TabsList>
  );
}
