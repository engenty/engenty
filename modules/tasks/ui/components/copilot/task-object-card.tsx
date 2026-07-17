"use client";

import type { ObjectDisplayItem, ObjectWidgetCardProps } from "@engenty/ai-ui";
import { Badge, cn, Skeleton } from "@engenty/ui-core";
import { CalendarClock, CircleCheckBig } from "lucide-react";
import { Link } from "react-router-dom";
import { tasksPaths } from "../../lib/tasks-routes.js";
import { useTaskDetailQuery } from "../../tasks-queries.js";

/** Chat object widget for `tasks:task:<id>` refs — live data, viewer authz. */

const LIST_INLINE_LIMIT = 10;

function TaskRow({
  taskId,
  snapshot,
}: {
  taskId: string;
  snapshot?: ObjectDisplayItem;
}) {
  const { data: task, isPending, isError } = useTaskDetailQuery(taskId);

  if (isPending && !snapshot) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2">
        <Skeleton className="size-4 rounded" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3.5 w-48" />
        </div>
      </div>
    );
  }

  const title = task?.title ?? snapshot?.title ?? taskId;
  const status = task?.status ?? snapshot?.status;

  return (
    <Link
      className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50"
      to={tasksPaths.taskDetail(taskId)}
    >
      <CircleCheckBig className="size-4 shrink-0 text-muted-foreground/70" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground/90 text-sm">
          {title}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {task?.identifier ? <span>{task.identifier}</span> : null}
          {task?.due_date ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" />
              {task.due_date.slice(0, 10)}
            </span>
          ) : null}
        </div>
      </div>
      {isError && !task ? (
        <span className="shrink-0 text-muted-foreground/70 text-xs">
          not available
        </span>
      ) : (
        <>
          {task?.priority && task.priority !== "normal" ? (
            <Badge
              className="shrink-0 text-[10px] capitalize"
              variant="outline"
            >
              {task.priority}
            </Badge>
          ) : null}
          {status ? (
            <Badge
              className="shrink-0 text-[10px] capitalize"
              variant={status === "done" ? "default" : "secondary"}
            >
              {String(status).replace(/_/g, " ")}
            </Badge>
          ) : null}
        </>
      )}
    </Link>
  );
}

export function TaskObjectCard({
  refs,
  items,
  provenance,
}: ObjectWidgetCardProps) {
  const itemByRef = new Map((items ?? []).map((item) => [item.ref, item]));
  const shown = refs.slice(0, LIST_INLINE_LIMIT);
  const overflow = refs.length - shown.length;
  const total = provenance?.total;

  return (
    <div
      className={cn(
        "ui-canvas-raised my-1 w-full overflow-hidden rounded-lg border-0 bg-card"
      )}
    >
      <div className="divide-y divide-border/50">
        {shown.map((ref) => (
          <TaskRow
            key={ref.id}
            snapshot={itemByRef.get(`tasks:task:${ref.id}`)}
            taskId={ref.id}
          />
        ))}
      </div>
      {overflow > 0 || (total && total > refs.length) ? (
        <Link
          className="block border-border/50 border-t px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
          to={tasksPaths.list}
        >
          {overflow > 0 ? `+${overflow} more · ` : ""}
          {total && total > refs.length
            ? `${refs.length} of ${total} — open tasks`
            : "open tasks"}
        </Link>
      ) : null}
    </div>
  );
}
