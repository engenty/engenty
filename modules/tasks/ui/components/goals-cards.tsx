import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { CalendarDays, ListChecks, Sparkles } from "lucide-react";
import type { Goal } from "../../src/schema/types.js";
import { COORDINATOR_AGENT_TYPE_KEY } from "./goal-properties-panel.js";
import { GoalStatusBadge } from "./goal-status-badge.js";

interface GoalsCardsProps {
  goals: Goal[];
  onGoalClick: (goal: Goal) => void;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function GoalsCards({ goals, onGoalClick }: GoalsCardsProps) {
  const { t } = useTranslation("tasks");

  return (
    // Full-width rows: goals are a short list read top-to-bottom, and the
    // multi-column grid wasted the width while truncating titles.
    <div className="flex flex-col gap-2">
      {goals.map((goal) => {
        const ownedByCoordinator =
          goal.owner_agent_type_key === COORDINATOR_AGENT_TYPE_KEY;
        return (
          <button
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors",
              "hover:border-primary/40 hover:bg-input/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
            key={goal.id}
            onClick={() => onGoalClick(goal)}
            type="button"
          >
            <GoalStatusBadge compact status={goal.status} />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate font-medium text-sm">{goal.title}</p>
              {goal.description ? (
                <p className="truncate text-muted-foreground text-xs">
                  {goal.description}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-x-3 text-muted-foreground text-xs">
              {ownedByCoordinator ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xxs">
                  <Sparkles className="h-3 w-3" />
                  {t("goals.detail.ownerCoordinator")}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <ListChecks className="h-3.5 w-3.5" />
                {t("goals.linkedTasks", { count: goal.linked_task_count ?? 0 })}
              </span>
              {goal.target_date ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(goal.target_date)}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
