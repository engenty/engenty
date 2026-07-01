import { useTranslation } from "@engenty/i18n/ui";
import { Link } from "react-router-dom";
import type {
  TaskStatusDefinition,
  TasksBriefingActivityItem,
} from "../../../src/schema/types.js";
import {
  buildActivityMessage,
  resolveActivityActor,
} from "../../lib/format-activity.js";
import { formatActivityTimeLabel } from "../../lib/format-activity-time.js";
import { tasksPaths } from "../../lib/tasks-routes.js";
import {
  ACTIVITY_ROW_NAME_CLASS,
  ACTIVITY_ROW_SHELL_CLASS,
  ACTIVITY_ROW_TEXT_CLASS,
  ACTIVITY_ROW_TIME_CLASS,
  ActivityActorAvatar,
} from "../task-activity-feed.js";

interface BriefingActivityListProps {
  emptyLabel: string;
  items: TasksBriefingActivityItem[];
  taskStatusDefinitions: TaskStatusDefinition[];
  title: string;
}

export function BriefingActivityList({
  emptyLabel,
  items,
  taskStatusDefinitions,
  title,
}: BriefingActivityListProps) {
  const { t } = useTranslation("tasks");

  return (
    <div className="min-w-0">
      <h3 className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </h3>
      {items.length === 0 ? (
        <div className="rounded-lg border border-border p-4">
          <p className="text-muted-foreground text-sm">{emptyLabel}</p>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {items.map(({ activity, task_identifier, task_title }) => {
            const actor = resolveActivityActor(activity, undefined, t);
            const message = buildActivityMessage(activity, {
              statusDefinitions: taskStatusDefinitions,
              t,
            });

            return (
              <Link
                className="block px-4 py-3 text-sm transition-colors hover:bg-accent/50"
                key={activity.id}
                to={tasksPaths.taskDetail(activity.task_id)}
              >
                <div className={ACTIVITY_ROW_SHELL_CLASS}>
                  <ActivityActorAvatar actor={actor} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className={ACTIVITY_ROW_NAME_CLASS}>
                        {actor.label}
                      </span>
                      <span className={ACTIVITY_ROW_TEXT_CLASS}>
                        {t(message.textKey, message.textValues)}
                      </span>
                      <span className={ACTIVITY_ROW_TIME_CLASS}>
                        {formatActivityTimeLabel(activity.created_at, t)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-muted-foreground text-xs">
                      <span className="font-mono">{task_identifier}</span>
                      <span className="mx-1.5">·</span>
                      <span>{task_title}</span>
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
