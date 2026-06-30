import { useTranslation } from "@engenty/i18n/ui";
import { Badge, cn } from "@engenty/ui-core";
import type { GoalStatus } from "../../src/schema/types.js";

const GOAL_STATUS_STYLES: Record<GoalStatus, string> = {
  planned:
    "bg-slate-500/10 text-slate-800 dark:text-slate-200 border-slate-500/20",
  active:
    "bg-blue-500/10 text-blue-800 dark:text-blue-200 dark:bg-blue-500/20 border-blue-500/20",
  achieved:
    "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 dark:bg-emerald-500/20 border-emerald-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const GOAL_STATUS_DOTS: Record<GoalStatus, string> = {
  planned: "bg-slate-500",
  active: "bg-blue-500",
  achieved: "bg-emerald-500",
  cancelled: "bg-muted-foreground/50",
};

export const GOAL_STATUSES: GoalStatus[] = [
  "planned",
  "active",
  "achieved",
  "cancelled",
];

interface GoalStatusBadgeProps {
  compact?: boolean;
  status: GoalStatus;
}

export function GoalStatusBadge({ status, compact }: GoalStatusBadgeProps) {
  const { t } = useTranslation("tasks");

  return (
    <Badge
      className={cn(
        compact ? "font-normal text-xxs" : "font-normal",
        GOAL_STATUS_STYLES[status]
      )}
      variant="secondary"
    >
      <span
        className={cn(
          "mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
          GOAL_STATUS_DOTS[status]
        )}
      />
      {t(`goals.status.${status}`)}
    </Badge>
  );
}
