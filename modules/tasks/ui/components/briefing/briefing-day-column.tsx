// Left Briefing column: Attention (inbox HITL/errors) · On your plate · Recently done.
import {
  type InboxNotificationDto,
  useInboxListQuery,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { isNeedsInput, NotificationList } from "@engenty/notifications-ui";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type {
  Task,
  TaskStatusDefinition,
  TasksBriefingResponse,
} from "../../../src/schema/types.js";
import { formatRelativeTime } from "../../lib/format-relative-time.js";
import { useTasksPaths } from "../../lib/use-tasks-paths.js";
import { TaskStatusBadge } from "../task-status-badge.js";
import {
  BriefingFooterAction,
  BriefingFooterLink,
  BriefingSectionFooter,
  BriefingSectionHead,
} from "./briefing-section.js";

function PlateRow({
  locale,
  task,
  taskHref,
  taskStatusDefinitions,
}: {
  locale: string;
  task: Task;
  taskHref: string;
  taskStatusDefinitions: TaskStatusDefinition[];
}) {
  return (
    <Link
      className="ui-card-raised flex w-full items-start gap-2.5 px-3 py-2 text-left"
      to={taskHref}
    >
      <span
        aria-hidden
        className="mt-1 size-1.5 shrink-0 rounded-full bg-primary/80"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm leading-snug">{task.title}</p>
          <TaskStatusBadge
            compact
            definitions={taskStatusDefinitions}
            status={task.status}
            task={task}
          />
        </div>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {task.identifier}
          {task.updated_at
            ? ` · ${formatRelativeTime(task.updated_at, locale)}`
            : null}
        </p>
      </div>
    </Link>
  );
}

function buildPlateTasks(snapshot: TasksBriefingResponse): Task[] {
  const seen = new Set<string>();
  const out: Task[] = [];
  for (const item of snapshot.focus_items) {
    if (seen.has(item.task.id)) {
      continue;
    }
    seen.add(item.task.id);
    out.push(item.task);
  }
  for (const item of snapshot.attention_items) {
    if (seen.has(item.task.id)) {
      continue;
    }
    seen.add(item.task.id);
    out.push(item.task);
  }
  for (const task of snapshot.recent_tasks) {
    if (seen.has(task.id)) {
      continue;
    }
    if (task.status === "done" || task.status === "cancelled") {
      continue;
    }
    if (
      task.status === "todo" ||
      task.status === "in_review" ||
      task.status === "backlog"
    ) {
      seen.add(task.id);
      out.push(task);
    }
  }
  return out.slice(0, 6);
}

function PlateCreateActions({ onCreateTask }: { onCreateTask: () => void }) {
  const { t } = useTranslation("tasks");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <BriefingFooterAction onClick={onCreateTask}>
        {t("list.newTask")}
      </BriefingFooterAction>
    </div>
  );
}

export function BriefingDayColumn({
  locale,
  onCreateTask,
  snapshot,
  taskStatusDefinitions,
}: {
  locale: string;
  onCreateTask: () => void;
  snapshot: TasksBriefingResponse;
  taskStatusDefinitions: TaskStatusDefinition[];
}) {
  const { t } = useTranslation("tasks");
  const tasksPaths = useTasksPaths();
  const inboxQuery = useInboxListQuery({ limit: 20, status: "open" });

  const attentionNotifications = useMemo(() => {
    const all = inboxQuery.data?.notifications ?? [];
    return all.filter(
      (n: InboxNotificationDto) => isNeedsInput(n) && n.status === "pending"
    );
  }, [inboxQuery.data?.notifications]);

  const plateTasks = useMemo(() => buildPlateTasks(snapshot), [snapshot]);
  const recentlyDone = useMemo(
    () =>
      snapshot.recent_tasks
        .filter((task) => task.status === "done")
        .slice(0, 5),
    [snapshot.recent_tasks]
  );

  return (
    <div className="space-y-6">
      <section>
        <BriefingSectionHead title={t("briefing.day.attention")} />
        {inboxQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">{t("inbox.loading")}</p>
        ) : attentionNotifications.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("briefing.day.emptyAttention")}
          </p>
        ) : (
          <NotificationList
            clearAllPlacement="bottom"
            footerStart={
              <BriefingFooterLink to={tasksPaths.inbox}>
                {t("inbox.viewAll")}
              </BriefingFooterLink>
            }
            grouped={false}
            locale={locale}
            notifications={attentionNotifications}
          />
        )}
      </section>

      <section>
        <BriefingSectionHead title={t("briefing.day.onYourPlate")} />
        {plateTasks.length === 0 ? (
          <>
            <p className="text-muted-foreground text-sm">
              {t("briefing.day.emptyPlate")}
            </p>
            <BriefingSectionFooter>
              <PlateCreateActions onCreateTask={onCreateTask} />
            </BriefingSectionFooter>
          </>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {plateTasks.map((task) => (
                <li key={task.id}>
                  <PlateRow
                    locale={locale}
                    task={task}
                    taskHref={tasksPaths.taskDetail(task.id)}
                    taskStatusDefinitions={taskStatusDefinitions}
                  />
                </li>
              ))}
            </ul>
            <BriefingSectionFooter>
              <BriefingFooterLink to={tasksPaths.list}>
                {t("inbox.viewAll")}
              </BriefingFooterLink>
              <PlateCreateActions onCreateTask={onCreateTask} />
            </BriefingSectionFooter>
          </>
        )}
      </section>

      <section>
        <BriefingSectionHead title={t("briefing.day.recentlyAccomplished")} />
        {recentlyDone.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("briefing.day.emptyRecentlyDone")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recentlyDone.map((task) => (
              <li className="flex items-start gap-2.5 opacity-70" key={task.id}>
                <span
                  aria-hidden
                  className="mt-1 size-1.5 shrink-0 rounded-full bg-emerald-600/80"
                />
                <div className="min-w-0">
                  <Link
                    className="font-medium text-sm hover:underline"
                    to={tasksPaths.taskDetail(task.id)}
                  >
                    {task.title}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {formatRelativeTime(
                      task.completed_at ?? task.updated_at,
                      locale
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
