import { useTranslation } from "@engenty/i18n/ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@engenty/ui-core";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  Goal,
  Task,
  TaskStatusDefinition,
} from "../../../src/schema/types.js";
import { GoalStatusBadge } from "../goal-status-badge.js";
import { OperationsRunRows } from "./operations-run-rows.js";
import { OperationsTaskRow } from "./operations-task-row.js";

interface OperationsGoalSectionProps {
  definitions: TaskStatusDefinition[];
  goal: Goal;
  onCancelRun?: (runId: string) => void;
  tasks: Task[];
}

export function OperationsGoalSection({
  definitions,
  goal,
  onCancelRun,
  tasks,
}: OperationsGoalSectionProps) {
  const { t } = useTranslation("tasks");

  const hasActive = tasks.some((task) => task.checkout_run_id);
  const [open, setOpen] = useState(hasActive);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const counts = useMemo(() => {
    let done = 0;
    let active = 0;
    let blocked = 0;
    for (const task of tasks) {
      if (task.status === "done" || task.status === "cancelled") {
        done++;
      } else if (task.checkout_run_id || task.status === "in_progress") {
        active++;
      } else {
        blocked++;
      }
    }
    return { done, active, blocked };
  }, [tasks]);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/50">
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
        <span className="min-w-0 flex-1 truncate text-left font-medium text-sm">
          {goal.title}
        </span>
        <GoalStatusBadge compact status={goal.status} />
        <span className="shrink-0 text-muted-foreground text-xs">
          {tasks.length}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-4 flex flex-col gap-0.5 border-border/50 border-l pl-2">
          {/* Summary counts */}
          <div className="flex gap-3 px-2 py-1 text-muted-foreground text-xs">
            {counts.active > 0 ? (
              <span>
                {t("operations.tree.tasksActive", { count: counts.active })}
              </span>
            ) : null}
            {counts.done > 0 ? (
              <span>
                {t("operations.tree.tasksDone", { count: counts.done })}
              </span>
            ) : null}
            {counts.blocked > 0 ? (
              <span>
                {t("operations.tree.tasksBlocked", { count: counts.blocked })}
              </span>
            ) : null}
          </div>

          {tasks.map((task) => (
            <div className="contents" key={task.id}>
              <OperationsTaskRow
                definitions={definitions}
                onOpenRun={(taskId) =>
                  setExpandedTaskId(expandedTaskId === taskId ? null : taskId)
                }
                task={task}
              />
              {expandedTaskId === task.id ? (
                <OperationsRunRows onCancelRun={onCancelRun} taskId={task.id} />
              ) : null}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
