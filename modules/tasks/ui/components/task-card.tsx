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
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { CheckCircle2, HelpCircle, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Task, TaskStatusDefinition } from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { TASK_STATUS_FILLS } from "../lib/task-status-styles.js";
import { TaskAssigneeLabel } from "./task-assignee-label.js";
import {
  resolveTaskStatusLabel,
  TaskStatusBadge,
} from "./task-status-badge.js";

interface TaskCardProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  onClick?: (task: Task) => void;
  onDelete?: (taskId: string) => void | Promise<void>;
  onEdit?: (task: Task) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  showAssignee?: boolean;
  task: Task;
  taskStatusDefinitions?: TaskStatusDefinition[];
}

export function statusIconForDefinition(
  def: TaskStatusDefinition,
  size: "sm" | "md" = "md"
) {
  const dotSm = "h-2.5 w-2.5";
  const dotMd = "h-3 w-3";
  const dot = size === "sm" ? dotSm : dotMd;
  if (def.id === "done" || def.color === "green") {
    return (
      <CheckCircle2
        className={cn(
          size === "sm" ? "h-4 w-4" : "h-5 w-5",
          "text-emerald-600 dark:text-emerald-400"
        )}
      />
    );
  }
  if (def.id === "request") {
    return (
      <HelpCircle
        className={cn(
          size === "sm" ? "h-4 w-4" : "h-5 w-5",
          "text-orange-600 dark:text-orange-300"
        )}
      />
    );
  }
  if (def.id === "in_progress") {
    return (
      <Play
        className={cn(
          size === "sm" ? "h-4 w-4" : "h-5 w-5",
          "text-orange-500 dark:text-orange-300"
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "shrink-0 rounded-full",
        dot,
        TASK_STATUS_FILLS[def.color] ?? "bg-muted-foreground/40"
      )}
    />
  );
}

export function TaskCard({
  task,
  onClick,
  onEdit,
  onDelete,
  onStatusChange,
  taskStatusDefinitions = BUILTIN_TASK_STATUS_DEFINITIONS,
  assigneeProfiles,
  showAssignee = true,
}: TaskCardProps) {
  const { t } = useTranslation("tasks");
  const [isHovered, setIsHovered] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const showActions = Boolean(onEdit || onDelete);

  const currentDef =
    taskStatusDefinitions.find((d) => d.id === task.status) ??
    ({
      id: task.status,
      label: task.status,
      color: "slate",
    } satisfies TaskStatusDefinition);

  const dueLabel = task.due_date
    ? new Date(task.due_date).toLocaleDateString()
    : null;
  const doneLike = task.status === "done";

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isAction =
      target.closest("button") || target.closest('[role="button"]');
    if (!isAction) {
      onClick?.(task);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!onDelete) {
      return;
    }
    setDeleting(true);
    try {
      await onDelete(task.id);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "ui-canvas-raised relative flex select-none items-center gap-4 rounded-md bg-card p-3",
          showActions ? "pr-20" : "pr-4",
          onClick &&
            "cursor-pointer transition-shadow hover:shadow-[var(--e-3)]"
        )}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onClick?.(task);
          }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        {showActions ? (
          <div className="absolute top-1/2 right-2 z-10 flex -translate-y-1/2 items-center gap-1">
            {onDelete ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("delete.deleteAria")}
                      className={cn(
                        "h-8 w-8 bg-background/80 p-0 text-muted-foreground backdrop-blur-sm transition-opacity hover:bg-muted hover:text-foreground",
                        isHovered ? "opacity-100" : "opacity-0"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteOpen(true);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("delete.action")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            {onEdit ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("delete.editAria")}
                      className={cn(
                        "h-8 w-8 bg-background/80 p-0 text-muted-foreground backdrop-blur-sm transition-opacity hover:bg-muted hover:text-foreground",
                        isHovered ? "opacity-100" : "opacity-0"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(task);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("detail.edit")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        ) : null}
        {onStatusChange ? (
          <DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center justify-center rounded-md p-1 hover:bg-muted"
                      onClick={(e) => e.stopPropagation()}
                      type="button"
                    >
                      {statusIconForDefinition(currentDef, "md")}
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {resolveTaskStatusLabel(task.status, taskStatusDefinitions)}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="start" className="w-56">
              {taskStatusDefinitions.map((def) => (
                <DropdownMenuItem
                  className="gap-2"
                  key={def.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (def.id !== task.status) {
                      onStatusChange(task.id, def.id);
                    }
                  }}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center",
                      task.status === def.id && "rounded-md bg-muted"
                    )}
                  >
                    {statusIconForDefinition(def, "sm")}
                  </span>
                  <span className="truncate">{def.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center justify-center p-1">
            {statusIconForDefinition(currentDef, "md")}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                "truncate font-medium",
                doneLike && "text-muted-foreground line-through"
              )}
            >
              {task.title}
            </span>
            <TaskStatusBadge
              compact
              definitions={taskStatusDefinitions}
              status={task.status}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
            <span className="font-mono">{task.identifier}</span>
            {showAssignee ? (
              <TaskAssigneeLabel
                assigneeProfiles={assigneeProfiles}
                className="text-xs"
                task={task}
              />
            ) : null}
            {dueLabel ? <span>{dueLabel}</span> : null}
          </div>
        </div>
      </div>

      {onDelete ? (
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
