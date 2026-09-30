import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AvatarStack,
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
import {
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import type { PhaseTask, ProjectTaskStatusDefinition } from "../api.js";
import { TASK_STATUS_FILLS } from "../lib/task-status-styles.js";
import { useUserDirectoryNames } from "../lib/use-user-directory.js";
import { resolveTaskStatusLabel } from "./task-status-badge.js";

interface TaskCardProps {
  onDelete?: (taskId: string) => void;
  onEdit?: (task: PhaseTask) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onVisibilityToggle?: (taskId: string, is_public: boolean) => void;
  showAssignees?: boolean;
  showVisibility?: boolean;
  task: PhaseTask;
  taskStatusDefinitions?: ProjectTaskStatusDefinition[];
  viewMode?: "internal" | "external";
}

/**
 * The status as a round checkbox: an open ring in the status colour, a dot
 * inside while in progress, a filled check when done. The ring is drawn with
 * the status's fill class (outer fill, card-coloured inner disc) so no second
 * colour table is needed.
 */
function statusIconForDefinition(
  def: ProjectTaskStatusDefinition,
  size: "sm" | "md" = "md"
) {
  const box = size === "sm" ? "size-3.5" : "size-4";
  if (def.id === "done" || def.color === "green") {
    return (
      <CheckCircle2
        className={cn(
          size === "sm" ? "size-4" : "size-[18px]",
          "text-emerald-600 dark:text-emerald-400"
        )}
      />
    );
  }
  const fill = TASK_STATUS_FILLS[def.color] ?? "bg-muted-foreground/40";
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full p-[1.5px]",
        box,
        fill
      )}
    >
      <span className="grid size-full place-items-center rounded-full bg-card">
        {def.id === "in_progress" ? (
          <span className={cn("size-1.5 rounded-full", fill)} />
        ) : null}
      </span>
    </span>
  );
}

function formatDueDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(new Date(value));
}

function isOverdue(value: string): boolean {
  const due = new Date(value);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
}

/** One card around a list of task rows, rows split by hairlines. */
export const TASK_LIST_CARD_CLASS =
  "ui-card-raised divide-y divide-border-soft overflow-hidden";

export function TaskCard({
  task,
  onStatusChange,
  onEdit,
  onDelete,
  showAssignees = true,
  onVisibilityToggle,
  showVisibility = true,
  viewMode = "internal",
  taskStatusDefinitions = BUILTIN_TASK_STATUS_DEFINITIONS,
}: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: task.id });
  const [isHovered, setIsHovered] = useState(false);
  const { i18n } = useTranslation();
  const directoryNames = useUserDirectoryNames();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const currentDef =
    taskStatusDefinitions.find((d) => d.id === task.status) ??
    ({
      id: task.status,
      label: task.status,
      color: "slate",
    } satisfies ProjectTaskStatusDefinition);

  const handleVisibilityToggle = () => {
    if (onVisibilityToggle) {
      onVisibilityToggle(task.id, !task.is_public);
    }
  };

  const displayTitle = task.title;

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isAction =
      target.closest("button") || target.closest('[role="button"]');
    const isDragHandle = target.closest("[data-dnd-kit-drag-handle]");
    if (!(isAction || isDragHandle) && onEdit && viewMode === "internal") {
      onEdit(task);
    }
  };

  const doneLike = task.status === "done";

  // The person the task is assigned to first, then its collaborators.
  const assigneeProfiles = [
    ...(task.primary_assignee_user_id
      ? [
          {
            id: task.primary_assignee_user_id,
            full_name: directoryNames.get(task.primary_assignee_user_id) ?? "?",
            avatar_url: null,
            is_connected: true,
          },
        ]
      : []),
    ...(showAssignees ? (task.task_team ?? []) : [])
      .filter((m) => m.user_id !== task.primary_assignee_user_id)
      .map((m) => ({
        id: m.user_id,
        full_name: m.profile?.full_name || directoryNames.get(m.user_id) || "?",
        avatar_url: m.profile?.avatar_url,
        is_connected: m.profile?.is_connected ?? true,
      })),
  ];

  return (
    <div className="relative">
      {isOver && (
        <div className="pointer-events-none absolute inset-0 z-10 animate-pulse rounded-md border-2 border-primary bg-primary/5" />
      )}
      <div
        className={cn(
          // A flat row: the list around it is the card (`TASK_LIST_CARD_CLASS`).
          "relative flex min-h-12 select-none items-center gap-2.5 bg-card px-3 py-1.5 pl-8",
          viewMode === "internal" && "cursor-pointer hover:bg-muted/40",
          isDragging && "cursor-grabbing"
        )}
        onClick={handleCardClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        ref={setNodeRef}
        style={style}
      >
        {viewMode === "internal" && (
          <div
            className="absolute top-1/2 left-2 z-20 -translate-y-1/2 cursor-grab active:cursor-grabbing"
            data-dnd-kit-drag-handle
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/40" />
          </div>
        )}
        {viewMode === "internal" && onStatusChange ? (
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
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "truncate font-medium",
                doneLike && "text-muted-foreground line-through"
              )}
            >
              {displayTitle}
            </span>
          </div>
          {task.discipline || task.hours ? (
            <div className="mt-0.5 flex items-center gap-4 text-muted-foreground text-xs">
              {task.discipline && <span>Discipline: {task.discipline}</span>}
              {task.hours && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{task.hours}h</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
        {/* At rest the row's quiet facts; on hover its actions, in the same
            place — so the facts sit flush right instead of beside hidden
            buttons. */}
        {isHovered && viewMode === "internal" ? null : (
          <div className="flex shrink-0 items-center gap-2">
            {task.due_date ? (
              <span
                className={cn(
                  "rounded-md bg-muted/60 px-1.5 py-0.5 text-muted-foreground text-xs",
                  !doneLike &&
                    isOverdue(task.due_date) &&
                    "bg-destructive/10 text-destructive"
                )}
              >
                {formatDueDate(task.due_date, i18n.language)}
              </span>
            ) : null}
            {task.is_public && showVisibility && onVisibilityToggle ? (
              <Eye className="h-3.5 w-3.5 text-green-600" />
            ) : null}
            {assigneeProfiles.length > 0 ? (
              <AvatarStack profiles={assigneeProfiles} size="sm" />
            ) : null}
          </div>
        )}
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5",
            !(isHovered && viewMode === "internal") && "hidden"
          )}
        >
          {viewMode === "internal" && (
            <>
              {onDelete && (
                <Button
                  className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(task.id);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {onEdit && (
                <Button
                  className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(task);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
          {showVisibility && onVisibilityToggle && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-7 w-7 p-0 hover:bg-muted"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVisibilityToggle();
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    {task.is_public ? (
                      <Eye className="h-4 w-4 text-green-600" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {task.is_public
                      ? "Visible on portal"
                      : "Hidden from portal"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
}
