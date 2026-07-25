// Right Briefing column: now → next → recently done as one stream.
import { useTranslation } from "@engenty/i18n/ui";
import { Badge, cn } from "@engenty/ui-core";
import { Check, CircleDot, Zap } from "lucide-react";
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
  kindLabel: string;
  statusLabel: string;
  task: Task;
}

function buildMotionItems(
  snapshot: TasksBriefingResponse,
  taskStatusDefinitions: TaskStatusDefinition[],
  labels: {
    done: string;
    next: string;
    now: string;
  },
  locale: string
): MotionItem[] {
  const seen = new Set<string>();
  const items: MotionItem[] = [];

  const push = (kind: MotionKind, task: Task, kindLabel: string) => {
    if (seen.has(task.id)) {
      return;
    }
    seen.add(task.id);
    items.push({
      kind,
      kindLabel,
      statusLabel:
        kind === "done"
          ? formatRelativeTime(task.completed_at ?? task.updated_at, locale)
          : resolveTaskStatusLabel(task.status, taskStatusDefinitions),
      task,
    });
  };

  for (const { task } of snapshot.focus_items) {
    push("now", task, labels.now);
  }

  for (const task of snapshot.recent_tasks) {
    if (task.status === "in_review") {
      push("now", task, labels.now);
    }
  }

  for (const { task } of snapshot.waiting_items) {
    push("next", task, labels.next);
  }

  for (const task of snapshot.recent_tasks) {
    if (task.status === "todo" || task.status === "backlog") {
      push("next", task, labels.next);
    }
  }

  for (const task of snapshot.recent_tasks) {
    if (task.status === "done") {
      push("done", task, labels.done);
    }
  }

  return items.slice(0, 10);
}

function MotionMarker({ kind }: { kind: MotionKind }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border shadow-sm",
        kind === "now" &&
          "border-primary/30 bg-primary text-primary-foreground",
        kind === "next" && "border-border bg-card text-muted-foreground",
        kind === "done" &&
          "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
      )}
    >
      {kind === "now" ? <Zap className="size-3.5" /> : null}
      {kind === "next" ? <CircleDot className="size-3.5" /> : null}
      {kind === "done" ? (
        <Check className="size-3.5" strokeWidth={2.5} />
      ) : null}
    </span>
  );
}

function MotionRow({ isLast, item }: { isLast: boolean; item: MotionItem }) {
  return (
    <li className="flex gap-3">
      <div className="flex w-7 shrink-0 flex-col items-center">
        <MotionMarker kind={item.kind} />
        {isLast ? null : (
          <span aria-hidden className="mt-1 w-px flex-1 bg-border" />
        )}
      </div>
      <Link
        className={cn(
          "min-w-0 flex-1 rounded-md outline-none transition-colors",
          "hover:bg-accent/30 focus-visible:bg-accent/30",
          isLast ? "pb-0" : "pb-5",
          item.kind === "done" && "opacity-80"
        )}
        to={tasksPaths.taskDetail(item.task.id)}
      >
        <div className="-mt-0.5 space-y-1 px-1.5 pt-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              className={cn(
                "font-medium text-[10px] uppercase tracking-wide",
                item.kind === "now" &&
                  "border-transparent bg-primary/15 text-primary",
                item.kind === "next" && "border-transparent",
                item.kind === "done" &&
                  "border-transparent bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
              )}
              variant={item.kind === "next" ? "secondary" : "outline"}
            >
              {item.kindLabel}
            </Badge>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {item.task.identifier}
            </span>
          </div>
          <p className="font-semibold text-sm leading-snug">
            {item.task.title}
          </p>
          <p className="text-muted-foreground text-xs">{item.statusLabel}</p>
        </div>
      </Link>
    </li>
  );
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
          done: t("briefing.motion.done"),
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
          <ol className="flex flex-col">
            {items.map((item, index) => (
              <MotionRow
                isLast={index === items.length - 1}
                item={item}
                key={item.task.id}
              />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
