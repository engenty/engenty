import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Skeleton } from "@engenty/ui-core";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Goal, TaskStatusDefinition } from "../../../src/schema/types.js";
import { getTasks } from "../../api.js";
import { tasksPaths } from "../../lib/tasks-routes.js";
import { OperationsGoalSection } from "./operations-goal-section.js";

interface OperationsTreeProps {
  definitions: TaskStatusDefinition[];
  goals: Goal[] | undefined;
  goalsLoading: boolean;
  onCancelRun?: (runId: string) => void;
}

export function OperationsTree({
  definitions,
  goals,
  goalsLoading,
  onCancelRun,
}: OperationsTreeProps) {
  const { t } = useTranslation("tasks");

  // Collect all goal ids to fetch their tasks
  const goalIds = useMemo(() => (goals ?? []).map((g) => g.id), [goals]);

  // Fetch agent-assigned tasks for active goals
  const tasksQuery = useQuery({
    queryKey: ["tasks", "operations", "goal-tasks", goalIds],
    queryFn: async ({ signal }) => {
      if (goalIds.length === 0) {
        return [];
      }
      // Fetch tasks with agent assignee to filter client-side by goal
      const result = await getTasks(
        { pageSize: 200, sortBy: "updated_at", sortOrder: "desc" },
        signal
      );
      return result.data;
    },
    enabled: goalIds.length > 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  if (goalsLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton className="h-12 w-full" key={i} />
        ))}
      </div>
    );
  }

  if (!goals || goals.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <h3 className="font-medium text-base">{t("operations.empty.title")}</h3>
        <p className="max-w-sm text-muted-foreground text-sm">
          {t("operations.empty.body")}
        </p>
        <Link
          className="text-primary text-sm hover:underline"
          to={tasksPaths.goals}
        >
          {t("operations.empty.cta")}
        </Link>
      </div>
    );
  }

  const allTasks = tasksQuery.data ?? [];

  // Group tasks by goal — only include agent-assigned tasks
  const tasksByGoal = new Map<string, typeof allTasks>();
  for (const task of allTasks) {
    if (
      task.goal_id &&
      goalIds.includes(task.goal_id) &&
      task.primary_assignee_kind === "agent"
    ) {
      const existing = tasksByGoal.get(task.goal_id) ?? [];
      existing.push(task);
      tasksByGoal.set(task.goal_id, existing);
    }
  }

  // Only show goals that have agent tasks
  const goalsWithTasks = goals.filter(
    (g) => (tasksByGoal.get(g.id)?.length ?? 0) > 0
  );

  if (goalsWithTasks.length === 0 && !tasksQuery.isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <h3 className="font-medium text-base">{t("operations.empty.title")}</h3>
        <p className="max-w-sm text-muted-foreground text-sm">
          {t("operations.empty.body")}
        </p>
        <Link
          className="text-primary text-sm hover:underline"
          to={tasksPaths.goals}
        >
          {t("operations.empty.cta")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {goalsWithTasks.map((goal) => (
        <OperationsGoalSection
          definitions={definitions}
          goal={goal}
          key={goal.id}
          onCancelRun={onCancelRun}
          tasks={tasksByGoal.get(goal.id) ?? []}
        />
      ))}
    </div>
  );
}
