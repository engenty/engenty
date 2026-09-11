import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Skeleton } from "@engenty/ui-core";
import { useState } from "react";
import type { TaskStatusDefinition } from "../../../src/schema/types.js";
import { getTasks } from "../../api.js";
import { OperationsRunRows } from "./operations-run-rows.js";
import { OperationsTaskRow } from "./operations-task-row.js";

interface AgentTasksSectionProps {
  definitions: TaskStatusDefinition[];
  onCancelRun?: (runId: string) => void;
}

export function AgentTasksSection({
  definitions,
  onCancelRun,
}: AgentTasksSectionProps) {
  const { t } = useTranslation("tasks");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["tasks", "operations", "agent-tasks"],
    queryFn: async ({ signal }) => {
      const result = await getTasks(
        { pageSize: 100, sortBy: "updated_at", sortOrder: "desc" },
        signal
      );
      return result.data.filter(
        (task) => task.primary_assignee_kind === "agent"
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

  const agentTasks = tasksQuery.data ?? [];

  if (agentTasks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <h3 className="font-medium text-base">{t("operations.empty.title")}</h3>
        <p className="max-w-sm text-muted-foreground text-sm">
          {t("operations.empty.body")}
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-medium text-sm">
          {t("operations.agentTasks.title")}
        </h3>
        <p className="text-muted-foreground text-xs">
          {t("operations.agentTasks.description")}
        </p>
      </div>
      <div className="flex flex-col gap-0.5">
        {agentTasks.map((task) => (
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
}
