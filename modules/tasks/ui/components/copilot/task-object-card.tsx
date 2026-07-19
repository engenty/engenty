"use client";

import {
  ObjectCardFrame,
  type ObjectDisplayItem,
  ObjectListFooter,
  ObjectListRow,
  type ObjectRef,
  ObjectRowList,
  type ObjectWidgetCardProps,
} from "@engenty/ai-ui";
import { Badge, Skeleton } from "@engenty/ui-core";
import { CalendarClock, CircleCheckBig, Hash } from "lucide-react";
import { tasksPaths } from "../../lib/tasks-routes.js";
import { useTaskDetailQuery } from "../../tasks-queries.js";

/** Chat object widget for `tasks:task:<id>` refs — live data, viewer authz. */

const LIST_INLINE_LIMIT = 10;

function TaskRow({
  taskRef,
  snapshot,
  onOpenInPanel,
}: {
  taskRef: ObjectRef;
  snapshot?: ObjectDisplayItem;
  onOpenInPanel?: (ref: ObjectRef) => void;
}) {
  const taskId = taskRef.id;
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
  const identifier = task?.identifier;

  return (
    <ObjectListRow
      actions={
        identifier
          ? [
              {
                icon: Hash,
                label: "Copy identifier",
                onSelect: () => void navigator.clipboard?.writeText(identifier),
              },
            ]
          : undefined
      }
      href={tasksPaths.taskDetail(taskId)}
      media={<CircleCheckBig className="size-4 text-muted-foreground/70" />}
      objectRef={taskRef}
      onOpenInPanel={onOpenInPanel}
      subtitle={
        identifier || task?.due_date ? (
          <span className="flex items-center gap-2">
            {identifier ? <span>{identifier}</span> : null}
            {task?.due_date ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3" />
                {task.due_date.slice(0, 10)}
              </span>
            ) : null}
          </span>
        ) : null
      }
      title={title}
      trailing={
        isError && !task ? (
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
        )
      }
    />
  );
}

export function TaskObjectCard({
  refs,
  items,
  provenance,
  onOpenInPanel,
}: ObjectWidgetCardProps) {
  const itemByRef = new Map((items ?? []).map((item) => [item.ref, item]));
  const shown = refs.slice(0, LIST_INLINE_LIMIT);

  return (
    <ObjectCardFrame>
      <ObjectRowList>
        {shown.map((ref) => (
          <TaskRow
            key={ref.id}
            onOpenInPanel={onOpenInPanel}
            snapshot={itemByRef.get(`tasks:task:${ref.id}`)}
            taskRef={ref}
          />
        ))}
      </ObjectRowList>
      <ObjectListFooter
        href={tasksPaths.list}
        label="tasks"
        overflow={refs.length - shown.length}
        shown={refs.length}
        total={provenance?.total}
      />
    </ObjectCardFrame>
  );
}
