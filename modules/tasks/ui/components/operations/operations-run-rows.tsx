import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Badge, Button, Skeleton } from "@engenty/ui-core";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import type { TaskRun } from "../../../src/schema/types.js";
import { getTaskRuns } from "../../api.js";
import { formatAgentTypeKey } from "../../lib/format-assignee.js";
import { tasksPaths } from "../../lib/tasks-routes.js";

function formatDuration(
  startedAt: string | null,
  finishedAt: string | null
): string {
  if (!startedAt) {
    return "—";
  }
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m ${seconds % 60}s`;
  }
  return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

function resolveRunStatus(
  run: TaskRun,
  t: (key: string) => string
): { label: string; variant: "default" | "secondary" | "outline" } {
  if (!run.run_finished_at) {
    return { label: t("operations.run.running"), variant: "default" };
  }
  // Finished runs — we don't have granular success/fail on TaskRun so treat as finished
  return { label: t("operations.run.finished"), variant: "secondary" };
}

interface OperationsRunRowsProps {
  onCancelRun?: (runId: string) => void;
  taskId: string;
}

export function OperationsRunRows({
  onCancelRun,
  taskId,
}: OperationsRunRowsProps) {
  const { t } = useTranslation("tasks");

  const runsQuery = useQuery({
    queryKey: ["tasks", "operations", "runs", taskId],
    queryFn: ({ signal }) => getTaskRuns(taskId, signal),
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });

  if (runsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-1 pl-6">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    );
  }

  const runs = runsQuery.data ?? [];
  if (runs.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 pl-6">
      {runs.map((run) => {
        const { label, variant } = resolveRunStatus(run, t);
        const isRunning = !run.run_finished_at;
        const duration = formatDuration(
          run.run_started_at ?? null,
          run.run_finished_at ?? null
        );
        const agentLabel = run.agent_type_key
          ? formatAgentTypeKey(run.agent_type_key)
          : null;

        return (
          <div
            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
            key={run.id}
          >
            <Badge className="font-normal text-xxs" variant={variant}>
              {label}
            </Badge>
            {agentLabel ? (
              <span className="text-muted-foreground">{agentLabel}</span>
            ) : null}
            <span className="text-muted-foreground">
              {t("operations.run.duration", { duration })}
            </span>
            <span className="flex-1" />
            <Link
              className="text-primary hover:underline"
              to={tasksPaths.taskDetail(taskId)}
            >
              {t("operations.run.view")}
            </Link>
            {isRunning && onCancelRun ? (
              <Button
                className="h-5 px-1.5 text-xs"
                onClick={() => onCancelRun(run.agent_session_run_id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X className="mr-0.5 size-3" />
                {t("operations.run.cancel")}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
