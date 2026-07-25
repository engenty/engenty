// Right Briefing column: now → next → recently done as one stream.
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import type {
  Task,
  TaskStatusDefinition,
  TasksBriefingResponse,
} from "../../../src/schema/types.js";
import { formatRelativeTime } from "../../lib/format-relative-time.js";
import { tasksPaths } from "../../lib/tasks-routes.js";
import { resolveTaskStatusLabel } from "../task-status-badge.js";

type MotionKind = "now" | "next" | "done";

interface MotionItem {
  kind: MotionKind;
  meta: string;
  task: Task;
}

function buildMotionItems(
  snapshot: TasksBriefingResponse,
  taskStatusDefinitions: TaskStatusDefinition[],
  labels: {
    next: string;
    now: string;
  },
  locale: string
): MotionItem[] {
  const seen = new Set<string>();
  const items: MotionItem[] = [];

  for (const { task } of snapshot.focus_items) {
    if (seen.has(task.id)) {
      continue;
    }
    seen.add(task.id);
    items.push({
      kind: "now",
      task,
      meta: `${labels.now} · ${resolveTaskStatusLabel(task.status, taskStatusDefinitions)} · ${task.identifier}`,
    });
  }

  for (const task of snapshot.recent_tasks) {
    if (seen.has(task.id) || task.status !== "in_review") {
      continue;
    }
    seen.add(task.id);
    items.push({
      kind: "now",
      task,
      meta: `${labels.now} · ${resolveTaskStatusLabel(task.status, taskStatusDefinitions)} · ${task.identifier}`,
    });
  }

  for (const { task } of snapshot.waiting_items) {
    if (seen.has(task.id)) {
      continue;
    }
    seen.add(task.id);
    items.push({
      kind: "next",
      task,
      meta: `${labels.next} · ${resolveTaskStatusLabel(task.status, taskStatusDefinitions)} · ${task.identifier}`,
    });
  }

  for (const task of snapshot.recent_tasks) {
    if (seen.has(task.id)) {
      continue;
    }
    if (task.status === "done" || task.status === "cancelled") {
      continue;
    }
    if (task.status === "todo" || task.status === "backlog") {
      seen.add(task.id);
      items.push({
        kind: "next",
        task,
        meta: `${labels.next} · ${resolveTaskStatusLabel(task.status, taskStatusDefinitions)} · ${task.identifier}`,
      });
    }
  }

  for (const task of snapshot.recent_tasks) {
    if (task.status !== "done" || seen.has(task.id)) {
      continue;
    }
    seen.add(task.id);
    items.push({
      kind: "done",
      task,
      meta: formatRelativeTime(task.completed_at ?? task.updated_at, locale),
    });
  }

  return items.slice(0, 10);
}

export function BriefingInMotion({
  locale,
  snapshot,
  taskStatusDefinitions,
}: {
  locale: string;
  snapshot: TasksBriefingResponse;
  taskStatusDefinitions: TaskStatusDefinition[];
}) {
  const { t } = useTranslation("tasks");
  const items = useMemo(
    () =>
      buildMotionItems(
        snapshot,
        taskStatusDefinitions,
        {
          next: t("briefing.motion.next"),
          now: t("briefing.motion.now"),
        },
        locale
      ),
    [locale, snapshot, t, taskStatusDefinitions]
  );

  return (
    <section>
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {t("briefing.motion.title")}
        </h2>
        <Link
          className="text-muted-foreground text-sm hover:text-foreground"
          to={tasksPaths.list}
        >
          {t("briefing.viewAllTasks")}
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("briefing.motion.empty")}
        </p>
      ) : (
        <div className="ui-canvas-raised rounded-md bg-card px-4 py-4">
          <ol className="relative ms-1.5 border-border border-s ps-5">
            {items.map((item) => (
              <li className="relative pb-5 last:pb-0" key={item.task.id}>
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 -left-[1.4rem] size-2 rounded-full border-2 bg-card",
                    item.kind === "now" && "border-primary bg-primary",
                    item.kind === "next" && "border-muted-foreground/40",
                    item.kind === "done" && "border-emerald-600/70"
                  )}
                />
                <Link
                  className={cn(
                    "block min-w-0",
                    item.kind === "done" && "opacity-70"
                  )}
                  to={tasksPaths.taskDetail(item.task.id)}
                >
                  <p className="font-semibold text-sm leading-snug hover:underline">
                    {item.kind === "done" ? (
                      <>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {t("briefing.motion.done")}{" "}
                        </span>
                        {item.task.title}
                      </>
                    ) : (
                      item.task.title
                    )}
                  </p>
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {item.meta}
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
