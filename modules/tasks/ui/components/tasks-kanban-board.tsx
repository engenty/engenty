import {
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
} from "@engenty/ui-core";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  Task,
  TaskStatusDefinition,
  TasksQueryParams,
} from "../../src/schema/types.js";
import { TASK_STATUS_KANBAN_DOT } from "../lib/task-status-styles.js";
import { useUpdateTasksListMutation } from "../tasks-queries.js";
import { TaskAssigneeLabel } from "./task-assignee-label.js";

function stripText(text: string | null | undefined): string {
  if (!text) {
    return "";
  }
  return text.replace(/\s+/g, " ").trim();
}

interface TasksKanbanCardProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void | Promise<void>;
  onTaskEdit?: (task: Task) => void;
  showAssignee?: boolean;
  statusColumns: TaskStatusDefinition[];
  task: Task;
}

function TasksKanbanCard({
  task,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  statusColumns,
  assigneeProfiles,
  showAssignee = true,
}: TasksKanbanCardProps) {
  const { t } = useTranslation("tasks");
  const [isHovered, setIsHovered] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const showActions = Boolean(onTaskEdit || onTaskDelete);

  const def = statusColumns.find((d) => d.id === task.status);
  const dotClass = def ? TASK_STATUS_KANBAN_DOT[def.color] : "bg-zinc-500";
  const description = stripText(task.description);
  const dueLabel = task.due_date
    ? new Date(task.due_date).toLocaleDateString()
    : null;

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isAction =
      target.closest("button") || target.closest('[role="button"]');
    if (!isAction) {
      onTaskClick?.(task);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!onTaskDelete) {
      return;
    }
    setDeleting(true);
    try {
      await onTaskDelete(task.id);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "ui-canvas-raised group relative block min-w-0 cursor-pointer rounded-md bg-card p-4 transition-shadow hover:shadow-[var(--e-3)]",
          showActions && "pr-12"
        )}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onTaskClick?.(task);
          }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="button"
        tabIndex={0}
      >
        {showActions ? (
          <div
            className={cn(
              "absolute top-2 right-2 z-10 transition-opacity duration-200",
              isHovered ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("detail.actionsMenu", "Actions")}
                  className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-0"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  size="sm"
                  variant="ghost"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-36"
                onClick={(e) => e.stopPropagation()}
              >
                {onTaskEdit && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskEdit(task);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    {t("detail.edit")}
                  </DropdownMenuItem>
                )}
                {onTaskEdit && onTaskDelete && <DropdownMenuSeparator />}
                {onTaskDelete && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("delete.action")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
        <span
          className={cn(
            "absolute top-2 rounded-full px-1.5 py-0.5 font-medium text-white text-xxs",
            showActions ? "right-10" : "right-2",
            dotClass
          )}
        >
          {def?.label ?? task.status}
        </span>
        <p className="font-mono text-muted-foreground text-xs">
          {task.identifier}
        </p>
        <p className="mt-1 truncate font-medium text-base">{task.title}</p>
        {description ? (
          <p className="mt-1.5 line-clamp-3 break-all text-muted-foreground text-sm">
            {description}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2 text-muted-foreground text-xs">
          {showAssignee ? (
            <TaskAssigneeLabel
              assigneeProfiles={assigneeProfiles}
              className="text-xs"
              task={task}
            />
          ) : (
            <span>—</span>
          )}
          {dueLabel ? <span>{dueLabel}</span> : null}
        </div>
      </div>

      {onTaskDelete ? (
        <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
          <AlertDialogContent onClick={(event) => event.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("delete.confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("delete.confirmDescription", { title: task.title })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>
                {t("edit.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={() => void handleDeleteConfirm()}
              >
                {t("delete.action")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}

interface SortableTaskCardProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void | Promise<void>;
  onTaskEdit?: (task: Task) => void;
  showAssignee?: boolean;
  statusColumns: TaskStatusDefinition[];
  task: Task;
}

function SortableTaskCard({
  task,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  statusColumns,
  assigneeProfiles,
  showAssignee,
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
      {isOver ? (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-primary/50 border-dashed bg-primary/5" />
      ) : null}
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={cn("touch-none", isDragging && "opacity-50")}
      >
        <TasksKanbanCard
          assigneeProfiles={assigneeProfiles}
          onTaskClick={onTaskClick}
          onTaskDelete={onTaskDelete}
          onTaskEdit={onTaskEdit}
          showAssignee={showAssignee}
          statusColumns={statusColumns}
          task={task}
        />
      </div>
    </div>
  );
}

interface KanbanColumnProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  definition: TaskStatusDefinition;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void | Promise<void>;
  onTaskEdit?: (task: Task) => void;
  showAssignee?: boolean;
  statusColumns: TaskStatusDefinition[];
  tasks: Task[];
}

function KanbanColumn({
  definition,
  tasks,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  statusColumns,
  assigneeProfiles,
  showAssignee,
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
                assigneeProfiles={assigneeProfiles}
                key={task.id}
                onTaskClick={onTaskClick}
                onTaskDelete={onTaskDelete}
                onTaskEdit={onTaskEdit}
                showAssignee={showAssignee}
                statusColumns={statusColumns}
                task={task}
              />
            ))}
            {tasks.length === 0 ? (
              <p className="py-8 text-center text-[11px] text-muted-foreground/50">
                —
              </p>
            ) : null}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

interface TasksKanbanBoardProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  listParams: TasksQueryParams;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void | Promise<void>;
  onTaskEdit?: (task: Task) => void;
  showAssignee?: boolean;
  statusColumns: TaskStatusDefinition[];
  tasks: Task[];
}

type TasksByStatus = Record<string, Task[]>;

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

export function TasksKanbanBoard({
  tasks,
  listParams,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  statusColumns,
  assigneeProfiles,
  showAssignee = true,
}: TasksKanbanBoardProps) {
  const { t } = useTranslation("tasks");
  const updateTaskMutation = useUpdateTasksListMutation(listParams);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

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
  const pendingStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      recentlyMoved.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [itemsByStatus]);

  const collisionDetection = useCallback(
    (args: {
      active: { id: unknown };
      collisionRect: {
        left: number;
        top: number;
        width: number;
        height: number;
      };
      droppableContainers: Iterable<{ id: unknown }>;
    }) => {
      const pointerHits = pointerWithin(args);
      const hits =
        pointerHits.length > 0 ? pointerHits : rectIntersection(args);
      let overId = getFirstCollision(hits, "id") ?? null;

      if (overId && columnIds.includes(overId)) {
        const columnItems = itemsByStatus[overId] ?? [];
        if (columnItems.length > 0) {
          const containers = Array.from(
            args.droppableContainers as Iterable<{ id: unknown }>
          );
          const filtered = containers.filter((c) =>
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
    const task = event.active.data.current?.task as Task | undefined;
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

      const task = active.data.current?.task as Task | undefined;
      if (!task) {
        pendingStatusRef.current = null;
        return;
      }

      let nextStatus = pendingStatusRef.current;
      pendingStatusRef.current = null;

      if ((!nextStatus || nextStatus === task.status) && over?.id) {
        const overId = String(over.id);
        nextStatus = columnIds.includes(overId)
          ? overId
          : findStatusForTask(itemsByStatus, overId, columnIds);
      }

      if (nextStatus && task.status !== nextStatus) {
        void updateTaskMutation
          .mutateAsync({
            taskId: task.id,
            input: { status: nextStatus },
          })
          .catch((err) => {
            toast.error(
              t("list.statusUpdateFailed"),
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
            assigneeProfiles={assigneeProfiles}
            definition={definition}
            key={definition.id}
            onTaskClick={onTaskClick}
            onTaskDelete={onTaskDelete}
            onTaskEdit={onTaskEdit}
            showAssignee={showAssignee}
            statusColumns={statusColumns}
            tasks={itemsByStatus[definition.id] ?? []}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="opacity-80 shadow-2xl">
            <TasksKanbanCard
              assigneeProfiles={assigneeProfiles}
              showAssignee={showAssignee}
              statusColumns={statusColumns}
              task={activeTask}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
