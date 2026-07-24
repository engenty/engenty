// Standing-task run history on the routine detail page.
import type { RoutineDto } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { useLiveCache } from "@engenty/live-cache";
import { useQuery } from "@engenty/query-client";
import { Badge } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { TaskRun } from "../../src/schema/types.js";
import { getTaskRuns } from "../api.js";
import { formatActivityTimeLabel } from "../lib/format-activity-time.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import { taskKeys } from "../tasks-queries.js";
import { formatRunDuration } from "./live-task-runs-panel.js";

function outcomeBadge(run: TaskRun, t: (key: string) => string) {
  const finished = Boolean(run.finished_at ?? run.run_finished_at);
  if (!finished) {
    return { label: t("detail.liveRunInProgress"), muted: false };
  }
  if (run.outcome === "completed_quiet") {
    return { label: t("routines.detail.runOk"), muted: true };
  }
  if (run.outcome === "failed") {
    return { label: t("routines.detail.failed"), muted: false };
  }
  if (run.outcome === "needs_approval") {
    return { label: t("routines.detail.runNeedsApproval"), muted: false };
  }
  return { label: t("detail.liveRunFinished"), muted: false };
}

export function RoutineRunsSection({ routine }: { routine: RoutineDto }) {
  const { t } = useTranslation("tasks");
  const { currentTenant, currentUserId } = useWorkspaceContext();
  const taskId = routine.standing_task_id;
  const runsQueryKey = useMemo(
    () => (taskId ? taskKeys.runs(taskId) : ["tasks", "routine-runs", "none"]),
    [taskId]
  );
  const runsQuery = useQuery({
    enabled: Boolean(taskId),
    queryKey: runsQueryKey,
    queryFn: ({ signal }) => getTaskRuns(taskId!, signal),
  });

  const liveBindings = useMemo(
    () =>
      taskId
        ? [
            {
              id: "routine_runs",
              postgresChanges: [{ schema: "module_tasks", table: "task_runs" }],
              resolveQueryKeys: () => [taskKeys.runs(taskId)],
            },
          ]
        : [],
    [taskId]
  );

  useLiveCache({
    bindings: liveBindings,
    channelName: `tasks:routine-runs:${currentTenant?.id ?? "none"}:${taskId ?? "none"}`,
    ctx: {
      tenantId: currentTenant?.id ?? "",
      userId: currentUserId ?? undefined,
      routeParams: { taskId: taskId ?? "" },
    },
    enabled: Boolean(taskId && currentTenant?.id),
  });

  if (!taskId) {
    return (
      <div className="space-y-2">
        <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {t("routines.detail.runs")}
        </h4>
        <p className="text-muted-foreground text-xs">
          {routine.last_result
            ? routine.last_result
            : t("routines.detail.runsEmpty")}
        </p>
      </div>
    );
  }

  const runs = runsQuery.data ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {t("routines.detail.runs")}
        </h4>
        {routine.standing_task_identifier ? (
          <Link
            className="inline-flex items-center gap-1 font-medium text-primary text-xs hover:underline"
            to={tasksPaths.taskDetail(taskId)}
          >
            {t("routines.detail.openTask", {
              identifier: routine.standing_task_identifier,
            })}
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      {runsQuery.isPending ? (
        <p className="text-muted-foreground text-xs">…</p>
      ) : runsQuery.isError ? (
        <p className="text-destructive text-xs">
          {t("routines.detail.runsLoadError")}
        </p>
      ) : runs.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("routines.detail.runsEmpty")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {runs.map((run) => {
            const badge = outcomeBadge(run, t);
            const finishedAt = run.finished_at ?? run.run_finished_at ?? null;
            const duration = formatRunDuration(
              run.run_started_at ?? run.created_at,
              finishedAt
            );
            const when = formatActivityTimeLabel(
              finishedAt ?? run.run_started_at ?? run.created_at,
              t
            );
            return (
              <li
                className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                  badge.muted
                    ? "border-transparent bg-muted/30 text-muted-foreground"
                    : "bg-card"
                }`}
                key={run.id}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge
                    className={badge.muted ? "opacity-70" : undefined}
                    variant={badge.muted ? "outline" : "secondary"}
                  >
                    {badge.label}
                  </Badge>
                  <span className="truncate text-muted-foreground">{when}</span>
                </div>
                {duration ? (
                  <span className="shrink-0 text-muted-foreground">
                    {duration}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
