import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Skeleton } from "@engenty/ui-core";
import { useState } from "react";
import type { TaskStatusDefinition } from "../../../src/schema/types.js";
import { getTasks } from "../../api.js";
import { OperationsRunRows } from "./operations-run-rows.js";
import { OperationsTaskRow } from "./operations-task-row.js";

interface UnplannedTasksSectionProps {
  definitions: TaskStatusDefinition[];
  onCancelRun?: (runId: string) => void;
}

export function UnplannedTasksSection({
  definitions,
  onCancelRun,
}: UnplannedTasksSectionProps) {
  const { t } = useTranslation("tasks");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["tasks", "operations", "unplanned"],
    queryFn: async ({ signal }) => {
      const result = await getTasks(
        { pageSize: 100, sortBy: "updated_at", sortOrder: "desc" },
        signal
      );
      // Agent-assigned tasks without a goal — split routine standing tasks out.
      return result.data.filter(
        (task) => task.primary_assignee_kind === "agent" && !task.goal_id
      );
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  if (tasksQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const all = tasksQuery.data ?? [];
  const routineTasks = all.filter((task) => Boolean(task.trigger_id));
  const unplannedTasks = all.filter((task) => !task.trigger_id);

  if (all.length === 0) {
    return null;
  }

  const renderGroup = (
    title: string,
    description: string,
    tasks: typeof all
  ) => {
    if (tasks.length === 0) {
      return null;
    }
    return (
      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-medium text-sm">{title}</h3>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        <div className="flex flex-col gap-0.5">
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
      </section>
    );
  };

  return (
    <>
      {renderGroup(
        t("operations.routines.title"),
        t("operations.routines.description"),
        routineTasks
      )}
      {renderGroup(
        t("operations.unplanned.title"),
        t("operations.unplanned.description"),
        unplannedTasks
      )}
    </>
  );
}
