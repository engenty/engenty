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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {goals.map((goal) => {
        const ownedByCoordinator =
          goal.owner_agent_type_key === COORDINATOR_AGENT_TYPE_KEY;
        return (
          <button
            className={cn(
              "flex min-h-[7rem] flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors",
              "hover:border-primary/40 hover:bg-input/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
            key={goal.id}
            onClick={() => onGoalClick(goal)}
            type="button"
          >
            <div className="flex items-center justify-between gap-2">
              <GoalStatusBadge compact status={goal.status} />
              {ownedByCoordinator ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xxs">
                  <Sparkles className="h-3 w-3" />
                  {t("goals.detail.ownerCoordinator")}
                </span>
              ) : null}
            </div>

            <p className="line-clamp-2 font-medium text-sm">{goal.title}</p>

            {goal.description ? (
              <p className="line-clamp-2 text-muted-foreground text-xs">
                {goal.description}
              </p>
            ) : null}

            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
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
