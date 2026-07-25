import { useInboxListQuery, useRoutinesListQuery } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Inbox, ListTodo, type LucideIcon, Target, Zap } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { TasksBriefingMode } from "../../../src/schema/types.js";
import { countOpenHitl } from "../../lib/inbox-classification.js";
import { tasksPaths } from "../../lib/tasks-routes.js";
import {
  useGoalsListQuery,
  useTasksBriefingQuery,
} from "../../tasks-queries.js";

interface BriefingHubCardsProps {
  mode: TasksBriefingMode;
  onCreateGoal: () => void;
  onCreateRoutine: () => void;
  onCreateTask: () => void;
}

function HubCard({
  badge,
  ctaLabel,
  ctaKind,
  description,
  icon: Icon,
  onCta,
  title,
  to,
}: {
  badge?: number;
  ctaKind: "open" | "create";
  ctaLabel: string;
  description: string;
  icon: LucideIcon;
  onCta?: () => void;
  title: string;
  to: string;
}) {
  return (
    <div
      className={cn(
        "ui-canvas-raised group relative flex min-h-[5.5rem] flex-col gap-2.5 rounded-md bg-card px-3.5 py-3",
        "transition-colors hover:bg-accent/40"
      )}
    >
      <Link
        aria-label={title}
        className="absolute inset-0 z-0 rounded-md"
        to={to}
      />
      <div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 font-semibold text-sm group-hover:text-primary">
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{title}</span>
        </div>
        {badge && badge > 0 ? (
          <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground leading-none">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </div>
      <p className="pointer-events-none relative z-10 flex-1 text-muted-foreground text-xs leading-snug">
        {description}
      </p>
      {ctaKind === "open" ? (
        <span className="pointer-events-none relative z-10 w-fit font-semibold text-primary text-xs">
          {ctaLabel}
        </span>
      ) : (
        <button
          className="relative z-10 w-fit font-semibold text-primary text-xs hover:underline"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCta?.();
          }}
          type="button"
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

export function BriefingHubCards({
  mode,
  onCreateGoal,
  onCreateRoutine,
  onCreateTask,
}: BriefingHubCardsProps) {
  const { t } = useTranslation("tasks");
  const inboxQuery = useInboxListQuery({ limit: 100, status: "open" });
  const briefingQuery = useTasksBriefingQuery(mode);
  const goalsQuery = useGoalsListQuery({ page: 1, pageSize: 1 });
  const routinesQuery = useRoutinesListQuery(true);

  const hitlCount = useMemo(
    () => countOpenHitl(inboxQuery.data?.notifications ?? []),
    [inboxQuery.data?.notifications]
  );
  const openInboxCount = inboxQuery.data?.notifications?.length ?? 0;
  const openTasksCount = briefingQuery.data?.summary.open ?? 0;
  const goalsCount = goalsQuery.data?.total ?? 0;
  const routinesCount = routinesQuery.data?.routines?.length ?? 0;

  return (
    <nav
      aria-label={t("briefing.hubs.navAria")}
      className="grid grid-cols-2 gap-2.5 md:grid-cols-4"
    >
      <HubCard
        badge={hitlCount}
        ctaKind="open"
        ctaLabel={t("briefing.hubs.open")}
        description={t("briefing.hubs.inboxCount", { count: openInboxCount })}
        icon={Inbox}
        title={t("tabs.inbox")}
        to={tasksPaths.inbox}
      />
      <HubCard
        ctaKind="create"
        ctaLabel={t("list.newTask")}
        description={t("briefing.hubs.tasksCount", { count: openTasksCount })}
        icon={ListTodo}
        onCta={onCreateTask}
        title={t("tabs.tasks")}
        to={tasksPaths.list}
      />
      <HubCard
        ctaKind="create"
        ctaLabel={t("goals.newGoal")}
        description={t("briefing.hubs.goalsCount", { count: goalsCount })}
        icon={Target}
        onCta={onCreateGoal}
        title={t("tabs.goals")}
        to={tasksPaths.goals}
      />
      <HubCard
        ctaKind="create"
        ctaLabel={t("routines.newRoutine")}
        description={t("briefing.hubs.routinesCount", {
          count: routinesCount,
        })}
        icon={Zap}
        onCta={onCreateRoutine}
        title={t("tabs.routines")}
        to={tasksPaths.routines}
      />
    </nav>
  );
}
