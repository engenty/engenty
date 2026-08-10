import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  getFirstCollision,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@engenty/i18n/ui";
import { AvatarStack, cn, ScrollArea } from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type {
  ProjectTaskListItem,
  ProjectTaskStatusDefinition,
  ProjectTasksQueryParams,
} from "../api.js";
import { TASK_STATUS_KANBAN_DOT } from "../lib/task-status-styles.js";
import { useUpdateTaskMutation } from "../queries.js";

function stripHtml(html: string | null | undefined): string {
  if (!html) {
    return "";
  }
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ProjectsTasksKanbanCardProps {
  onTaskClick?: (task: ProjectTaskListItem) => void;
  showAssignees?: boolean;
  statusColumns: ProjectTaskStatusDefinition[];
  task: ProjectTaskListItem;
}

function ProjectsTasksKanbanCard({
  task,
  onTaskClick,
  showAssignees = true,
  statusColumns,
}: ProjectsTasksKanbanCardProps) {
  const projectUrl = `/mdl/projects/${task.project_id}`;
  const contentText = stripHtml(task.content);
  const def = statusColumns.find((d) => d.id === task.status);
  const dotClass = def ? TASK_STATUS_KANBAN_DOT[def.color] : "bg-zinc-500";
  const statusLabel = def?.label ?? task.status;

  return (
    <div
      className="group relative block min-w-0 cursor-pointer rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md"
      onClick={() => onTaskClick?.(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onTaskClick?.(task);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span
        className={cn(
          "absolute top-2 right-2 rounded-full px-1.5 py-0.5 font-medium text-white text-xxs",
          dotClass
        )}
      >
        {statusLabel}
      </span>
      <p className="truncate pr-16 text-muted-foreground text-xs">
        <Link
          className="underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
          to={projectUrl}
        >
          {task.project_title || "—"}
        </Link>
      </p>
      <p className="mt-1 truncate font-medium text-base">{task.title}</p>
      {contentText ? (
        <p className="mt-1.5 line-clamp-3 break-all text-muted-foreground text-sm">
          {contentText}
        </p>
      ) : null}
      {showAssignees && task.task_team && task.task_team.length > 0 ? (
        <div className="mt-3 flex justify-end">
          <AvatarStack
            max={4}
            profiles={task.task_team.map((m) => ({
              id: m.user_id,
              full_name: m.profile?.full_name ?? m.user_id.slice(0, 8),
              avatar_url: m.profile?.avatar_url ?? null,
              is_connected: m.profile?.is_connected ?? true,
            }))}
            size="sm"
          />
        </div>
      ) : null}
    </div>
  );
}

interface SortableTaskCardProps {
  onTaskClick?: (task: ProjectTaskListItem) => void;
  showAssignees?: boolean;
  statusColumns: ProjectTaskStatusDefinition[];
  task: ProjectTaskListItem;
}

function SortableTaskCard({
  task,
  onTaskClick,
  showAssignees = true,
  statusColumns,
}: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: task.id, data: { task } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div className="relative">
      {isOver && (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-primary/50 border-dashed bg-primary/5" />
      )}
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={cn("touch-none", isDragging && "opacity-50")}
      >
        <ProjectsTasksKanbanCard
          onTaskClick={onTaskClick}
          showAssignees={showAssignees}
          statusColumns={statusColumns}
          task={task}
        />
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  definition: ProjectTaskStatusDefinition;
  onTaskClick?: (task: ProjectTaskListItem) => void;
  showAssignees?: boolean;
  statusColumns: ProjectTaskStatusDefinition[];
  tasks: ProjectTaskListItem[];
}

function KanbanColumn({
  definition,
  tasks,
  onTaskClick,
  showAssignees = true,
  statusColumns,
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: definition.id,
    data: { status: definition.id },
  });

  return (
    <div
      className={cn(
        "flex min-w-[320px] flex-1 flex-col rounded-lg border bg-muted/20 transition-colors",
        isOver && "border-primary/30 bg-muted/40"
      )}
      ref={setNodeRef}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            TASK_STATUS_KANBAN_DOT[definition.color] ?? "bg-zinc-400"
          )}
        />
        <span className="font-medium text-xs">{definition.label}</span>
        <span className="ml-auto flex h-4 min-w-[1.25rem] items-center justify-center rounded-full bg-muted px-1 font-normal text-xxs">
          {tasks.length}
        </span>
      </div>
      <ScrollArea className="flex-1 p-2">
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                onTaskClick={onTaskClick}
                showAssignees={showAssignees}
                statusColumns={statusColumns}
                task={task}
              />
            ))}
            {tasks.length === 0 && (
              <p className="py-8 text-center text-[11px] text-muted-foreground/50">
                —
              </p>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

interface ProjectsTasksKanbanBoardProps {
  listParams: ProjectTasksQueryParams;
  onTaskClick?: (task: ProjectTaskListItem) => void;
  showAssignees?: boolean;
  statusColumns: ProjectTaskStatusDefinition[];
  tasks: ProjectTaskListItem[];
}

type TasksByStatus = Record<string, ProjectTaskListItem[]>;

function findStatusForTask(
  items: TasksByStatus,
  taskId: string,
  columnIds: string[]
): string | null {
  for (const status of columnIds) {
    if (items[status]?.some((t) => t.id === taskId)) {
      return status;
    }
  }
  return null;
}

export function ProjectsTasksKanbanBoard({
  tasks,
  listParams,
  onTaskClick,
  showAssignees = true,
  statusColumns,
}: ProjectsTasksKanbanBoardProps) {
  const { t } = useTranslation("projects");
  const updateTaskMutation = useUpdateTaskMutation(listParams);
  const [activeTask, setActiveTask] = useState<ProjectTaskListItem | null>(
    null
  );

  const columnIds = useMemo(
    () => statusColumns.map((d) => d.id),
    [statusColumns]
  );

  const initialTasksByStatus = useMemo(() => {
    const acc: TasksByStatus = {};
    for (const id of columnIds) {
      acc[id] = [];
    }
    const fallback = columnIds[0] ?? "todo";
    for (const taskItem of tasks) {
      const col = columnIds.includes(taskItem.status)
        ? taskItem.status
        : fallback;
      if (!acc[col]) {
        acc[col] = [];
      }
      acc[col].push(taskItem);
    }
    return acc;
  }, [tasks, columnIds]);

  const [itemsByStatus, setItemsByStatus] =
    useState<TasksByStatus>(initialTasksByStatus);

  useEffect(() => {
    setItemsByStatus(initialTasksByStatus);
  }, [initialTasksByStatus]);

  const lastOverId = useRef<string | null>(null);
  const recentlyMoved = useRef(false);
  /** Target status when dragging across columns; used to persist on drop */
  const pendingStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      recentlyMoved.current = false;
    });
    return () => cancelAnimationFrame(t);
  }, [itemsByStatus]);

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const pointerHits = pointerWithin(args);
      const hits =
        pointerHits.length > 0 ? pointerHits : rectIntersection(args);
      let overId = getFirstCollision(hits, "id") ?? null;

      if (overId != null && columnIds.includes(String(overId))) {
        const columnItems = itemsByStatus[String(overId)] ?? [];
        if (columnItems.length > 0) {
          const filtered = args.droppableContainers.filter((c) =>
            columnItems.some((t) => t.id === c.id)
          );
          const closest = closestCenter({
            ...args,
            droppableContainers: filtered,
          });
          overId = closest[0]?.id ?? overId;
        }
      }

      lastOverId.current = overId == null ? null : String(overId);
      if (recentlyMoved.current) {
        lastOverId.current = String(args.active.id);
      }
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [itemsByStatus, columnIds]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task as
      | ProjectTaskListItem
      | undefined;
    if (task) {
      setActiveTask(task);
    }
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over?.id || active.id === over.id) {
        return;
      }

      const overId = String(over.id);
      const activeStatus = findStatusForTask(
        itemsByStatus,
        String(active.id),
        columnIds
      );

      if (!activeStatus) {
        return;
      }

      const isOverColumn = columnIds.includes(overId);
      const overStatus = isOverColumn
        ? overId
        : findStatusForTask(itemsByStatus, overId, columnIds);

      if (!overStatus || activeStatus === overStatus) {
        if (activeStatus === overStatus) {
          const col = itemsByStatus[activeStatus];
          const oldIdx = col.findIndex((t) => t.id === active.id);
          const newIdx = col.findIndex((t) => t.id === overId);
          if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
            setItemsByStatus((prev) => ({
              ...prev,
              [activeStatus]: arrayMove(col, oldIdx, newIdx),
            }));
          }
        }
        return;
      }

      const overColumnItems = itemsByStatus[overStatus];
      const overIndex = overColumnItems.findIndex((t) => t.id === overId);
      const activeItem = itemsByStatus[activeStatus].find(
        (t) => t.id === active.id
      );
      if (!activeItem) {
        return;
      }

      let insertIndex: number;
      if (isOverColumn && overColumnItems.length === 0) {
        insertIndex = 0;
      } else if (isOverColumn) {
        insertIndex = overColumnItems.length;
      } else {
        const isBelow =
          active.rect.current.translated &&
          over.rect &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;
        insertIndex = overIndex >= 0 ? overIndex + (isBelow ? 1 : 0) : 0;
      }

      recentlyMoved.current = true;
      pendingStatusRef.current = overStatus;
      setItemsByStatus((prev) => ({
        ...prev,
        [activeStatus]: prev[activeStatus].filter((t) => t.id !== active.id),
        [overStatus]: [
          ...prev[overStatus].slice(0, insertIndex),
          { ...activeItem, status: overStatus },
          ...prev[overStatus].slice(insertIndex),
        ],
      }));
    },
    [itemsByStatus, columnIds]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTask(null);
      recentlyMoved.current = false;

      const task = active.data.current?.task as ProjectTaskListItem | undefined;
      if (!task) {
        pendingStatusRef.current = null;
        return;
      }

      // Prefer pending status from onDragOver (cross-column move)
      let nextStatus = pendingStatusRef.current;
      pendingStatusRef.current = null;

      // Fallback: derive from drop target when no pending (e.g. fast drop)
      if ((!nextStatus || nextStatus === task.status) && over?.id) {
        const overId = String(over.id);
        nextStatus = columnIds.includes(overId)
          ? overId
          : findStatusForTask(itemsByStatus, overId, columnIds);
      }

      if (nextStatus && task.status !== nextStatus) {
        void updateTaskMutation
          .mutateAsync({
            projectId: task.project_id,
            taskId: task.id,
            patch: { status: nextStatus },
          })
          .catch((err) => {
            toast.error(
              t("tasks.statusUpdateFailed"),
              err instanceof Error ? { description: err.message } : undefined
            );
          });
      }
    },
    [itemsByStatus, columnIds, updateTaskMutation, t]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  return (
    <DndContext
      collisionDetection={collisionDetection}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="flex min-h-0 flex-1 gap-3 pb-2">
        {statusColumns.map((definition) => (
          <KanbanColumn
            definition={definition}
            key={definition.id}
            onTaskClick={onTaskClick}
            showAssignees={showAssignees}
            statusColumns={statusColumns}
            tasks={itemsByStatus[definition.id] ?? []}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="opacity-80 shadow-2xl">
            <ProjectsTasksKanbanCard
              showAssignees={showAssignees}
              statusColumns={statusColumns}
              task={activeTask}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
