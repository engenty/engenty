import { useInboxListQuery } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { isAttention } from "@engenty/notifications-ui";
import { Inbox, ListTodo, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { TasksBriefingMode } from "../../../src/schema/types.js";
import { useTasksPaths } from "../../lib/use-tasks-paths.js";
import { useTasksBriefingQuery } from "../../tasks-queries.js";

interface BriefingHubCardsProps {
  mode: TasksBriefingMode;
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
    <div className="ui-card-raised ui-card-interactive group relative flex min-h-[5.5rem] flex-col gap-2.5 px-3.5 py-3">
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
  onCreateTask,
}: BriefingHubCardsProps) {
  const { t } = useTranslation("tasks");
  const tasksPaths = useTasksPaths();
  const inboxQuery = useInboxListQuery({ limit: 100, status: "open" });
  const briefingQuery = useTasksBriefingQuery(mode);

  const attentionCount = useMemo(
    () => (inboxQuery.data?.notifications ?? []).filter(isAttention).length,
    [inboxQuery.data?.notifications]
  );
  const openInboxCount = inboxQuery.data?.notifications?.length ?? 0;
  const openTasksCount = briefingQuery.data?.summary.open ?? 0;

  return (
    <nav
      aria-label={t("briefing.hubs.navAria")}
      className="grid grid-cols-2 gap-2.5 md:grid-cols-3"
    >
      <HubCard
        badge={attentionCount}
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
    </nav>
  );
}
