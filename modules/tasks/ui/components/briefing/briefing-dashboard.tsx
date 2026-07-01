import { useTranslation } from "@engenty/i18n/ui";
import { Card, CardContent } from "@engenty/ui-core";
import { AlertCircle, CircleDot, Clock3, ListTodo } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  TaskStatusDefinition,
  TasksBriefingResponse,
} from "../../../src/schema/types.js";
import { tasksPaths } from "../../lib/tasks-routes.js";
import { TaskCard } from "../task-card.js";
import { BriefingActivityList } from "./briefing-activity-list.js";
import { BriefingMetricCard } from "./briefing-metric-card.js";
import { BriefingRecentTasksList } from "./briefing-recent-tasks-list.js";

interface BriefingOverviewDashboardProps {
  snapshot: TasksBriefingResponse;
  taskStatusDefinitions: TaskStatusDefinition[];
}

export function BriefingOverviewDashboard({
  snapshot,
  taskStatusDefinitions,
}: BriefingOverviewDashboardProps) {
  const { t } = useTranslation("tasks");
  const { summary } = snapshot;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <BriefingMetricCard
          description={
            <span>
              {summary.in_progress} {t("briefing.metrics.inProgressHint")}
            </span>
          }
          icon={ListTodo}
          label={t("briefing.metrics.open")}
          to={tasksPaths.list}
          value={summary.open}
        />
        <BriefingMetricCard
          description={
            <span>
              {summary.blocked} {t("briefing.metrics.blockedHint")}
            </span>
          }
          icon={CircleDot}
          label={t("briefing.metrics.inProgress")}
          to={tasksPaths.list}
          value={summary.in_progress}
        />
        <BriefingMetricCard
          description={
            <span>
              {summary.waiting} {t("briefing.metrics.waitingHint")}
            </span>
          }
          icon={Clock3}
          label={t("briefing.metrics.waiting")}
          to={tasksPaths.list}
          value={summary.waiting}
        />
        <BriefingMetricCard
          description={
            <span>
              {summary.stale} {t("briefing.metrics.staleHint")}
            </span>
          }
          icon={AlertCircle}
          label={t("briefing.metrics.attention")}
          to={tasksPaths.list}
          value={summary.attention}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BriefingActivityList
          emptyLabel={t("briefing.emptyActivity")}
          items={snapshot.recent_activity}
          taskStatusDefinitions={taskStatusDefinitions}
          title={t("briefing.recentActivity")}
        />
        <BriefingRecentTasksList
          emptyLabel={t("briefing.emptyRecentTasks")}
          taskStatusDefinitions={taskStatusDefinitions}
          tasks={snapshot.recent_tasks}
          title={t("briefing.recentTasks")}
        />
      </div>
    </div>
  );
}

interface BriefingPersonalDashboardProps {
  reasonLabel: (reason: string) => string;
  snapshot: TasksBriefingResponse;
  taskStatusDefinitions: TaskStatusDefinition[];
}

export function BriefingPersonalDashboard({
  reasonLabel,
  snapshot,
  taskStatusDefinitions,
}: BriefingPersonalDashboardProps) {
  const { t } = useTranslation("tasks");
  const { summary } = snapshot;
  const priorityItems = [
    ...snapshot.focus_items,
    ...snapshot.attention_items.filter(
      (item) =>
        !snapshot.focus_items.some(({ task }) => task.id === item.task.id)
    ),
  ].slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <BriefingMetricCard
          icon={ListTodo}
          label={t("briefing.metrics.myOpen")}
          value={summary.open}
        />
        <BriefingMetricCard
          icon={CircleDot}
          label={t("briefing.metrics.inProgress")}
          value={summary.in_progress}
        />
        <BriefingMetricCard
          icon={Clock3}
          label={t("briefing.metrics.waiting")}
          value={summary.waiting}
        />
        <BriefingMetricCard
          icon={AlertCircle}
          label={t("briefing.metrics.attention")}
          value={summary.attention}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            {t("briefing.priorities")}
          </h3>
          <Card>
            <CardContent className="space-y-2 pt-4">
              {priorityItems.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("briefing.emptyPriorities")}
                </p>
              ) : (
                priorityItems.map(({ task, reason }) => (
                  <div className="space-y-1" key={task.id}>
                    <p className="text-muted-foreground text-xs">
                      {reasonLabel(reason)}
                    </p>
                    <Link to={tasksPaths.taskDetail(task.id)}>
                      <TaskCard
                        showAssignee={false}
                        task={task}
                        taskStatusDefinitions={taskStatusDefinitions}
                      />
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <BriefingRecentTasksList
          emptyLabel={t("briefing.emptyRecentTasks")}
          taskStatusDefinitions={taskStatusDefinitions}
          tasks={snapshot.recent_tasks}
          title={t("briefing.recentTasks")}
        />
      </div>

      {snapshot.recent_activity.length > 0 ? (
        <BriefingActivityList
          emptyLabel={t("briefing.emptyActivity")}
          items={snapshot.recent_activity}
          taskStatusDefinitions={taskStatusDefinitions}
          title={t("briefing.recentActivity")}
        />
      ) : null}
    </div>
  );
}
