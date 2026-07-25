// Left Briefing column: Attention (inbox HITL/errors) · On your plate · Recently done.
import {
  type InboxNotificationDto,
  useInboxListQuery,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";
import type {
  Task,
  TaskStatusDefinition,
  TasksBriefingResponse,
} from "../../../src/schema/types.js";
import { formatRelativeTime } from "../../lib/format-relative-time.js";
import { isNeedsInput } from "../../lib/inbox-classification.js";
import { tasksPaths } from "../../lib/tasks-routes.js";
import { InboxList } from "../inbox/inbox-list.js";
import { TaskStatusBadge } from "../task-status-badge.js";

function SectionHead({ action, title }: { action?: ReactNode; title: string }) {
  return (
    <div className="mb-3.5 flex items-baseline justify-between gap-3">
      <h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
        {title}
      </h2>
      {action}
    </div>
  );
}

function PlateRow({
  locale,
  task,
  taskStatusDefinitions,
}: {
  locale: string;
  task: Task;
  taskStatusDefinitions: TaskStatusDefinition[];
}) {
  return (
    <Link
      className={cn(
        "ui-canvas-raised flex w-full items-start gap-3 rounded-md bg-card px-4 py-3 text-left",
        "transition-shadow hover:shadow-[var(--e-3)]"
      )}
      to={tasksPaths.taskDetail(task.id)}
    >
      <span
        aria-hidden
        className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/80"
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

export function BriefingDayColumn({
  locale,
  snapshot,
  taskStatusDefinitions,
}: {
  locale: string;
  snapshot: TasksBriefingResponse;
  taskStatusDefinitions: TaskStatusDefinition[];
}) {
  const { t } = useTranslation("tasks");
  const inboxQuery = useInboxListQuery({ limit: 20, status: "open" });

  const attentionNotifications = useMemo(() => {
    const all = inboxQuery.data?.notifications ?? [];
    return all.filter(
      (n: InboxNotificationDto) =>
        isNeedsInput(n) && (n.status === "pending" || n.status === "delivered")
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
    <div className="space-y-9">
      <section>
        <SectionHead
          action={
            <Link
              className="text-muted-foreground text-sm hover:text-foreground"
              to={tasksPaths.inbox}
            >
              {t("briefing.hubs.open")}
            </Link>
          }
          title={t("briefing.day.attention")}
        />
        {inboxQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">{t("inbox.loading")}</p>
        ) : attentionNotifications.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("briefing.day.emptyAttention")}
          </p>
        ) : (
          <InboxList
            grouped={false}
            locale={locale}
            notifications={attentionNotifications}
          />
        )}
      </section>

      <section>
        <SectionHead
          action={
            <Link
              className="text-muted-foreground text-sm hover:text-foreground"
              to={tasksPaths.list}
            >
              {t("tabs.tasks")}
            </Link>
          }
          title={t("briefing.day.onYourPlate")}
        />
        {plateTasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("briefing.day.emptyPlate")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {plateTasks.map((task) => (
              <li key={task.id}>
                <PlateRow
                  locale={locale}
                  task={task}
                  taskStatusDefinitions={taskStatusDefinitions}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHead title={t("briefing.day.recentlyAccomplished")} />
        {recentlyDone.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("briefing.day.emptyRecentlyDone")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {recentlyDone.map((task) => (
              <li className="flex items-start gap-3 opacity-70" key={task.id}>
                <span
                  aria-hidden
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-600/80"
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
