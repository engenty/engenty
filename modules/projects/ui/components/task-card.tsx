import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AvatarStack,
  Badge,
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
  HelpCircle,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import type { PhaseTask, ProjectTaskStatusDefinition } from "../api.js";
import { TASK_STATUS_FILLS } from "../lib/task-status-styles.js";
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

function statusIconForDefinition(
  def: ProjectTaskStatusDefinition,
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

  const getStatusBadge = (status: string) => {
    const def =
      taskStatusDefinitions.find((d) => d.id === status) ?? currentDef;

    let customClass = "";
    if (def.color === "orange") {
      customClass =
        "bg-orange-500/10 text-orange-800 dark:text-orange-200 dark:bg-orange-500/20 border-orange-500/20";
    } else if (def.color === "green") {
      customClass =
        "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 dark:bg-emerald-500/20 border-emerald-500/20";
    } else if (def.color === "blue") {
      customClass =
        "bg-blue-500/10 text-blue-800 dark:text-blue-200 dark:bg-blue-500/20 border-blue-500/20";
    }

    return (
      <Badge
        className={cn(
          "min-h-5 px-1.5 py-0 font-normal leading-none",
          customClass,
          !customClass && "border"
        )}
        variant="secondary"
      >
        <span className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
        {resolveTaskStatusLabel(status, taskStatusDefinitions)}
      </Badge>
    );
  };

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

  return (
    <div className="relative">
      {isOver && (
        <div className="pointer-events-none absolute inset-0 z-10 animate-pulse rounded-md border-2 border-primary bg-primary/5" />
      )}
      <div
        className={cn(
          "relative flex select-none items-center gap-4 rounded-lg border bg-card p-3 pl-8",
          viewMode === "internal" &&
            "cursor-pointer transition-colors hover:border-primary/50",
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
            {getStatusBadge(task.status)}
          </div>
          <div className="mt-1 flex items-center gap-4 text-muted-foreground text-sm">
            {task.discipline && <span>Discipline: {task.discipline}</span>}
            {task.hours && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{task.hours}h</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {viewMode === "internal" && (
            <>
              {onDelete && (
                <Button
                  className={cn(
                    "h-8 w-8 p-0 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
                    isHovered ? "opacity-100" : "opacity-0"
                  )}
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
                  className={cn(
                    "h-8 w-8 p-0 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
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
              )}
            </>
          )}
          {showVisibility && onVisibilityToggle && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className={cn(
                      "h-8 w-8 p-0 transition-opacity hover:bg-muted",
                      isHovered || task.is_public ? "opacity-100" : "opacity-0"
                    )}
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
        {showAssignees && task.task_team && task.task_team.length > 0 && (
          <AvatarStack
            profiles={task.task_team.map((m) => ({
              id: m.user_id,
              full_name: m.profile?.full_name || "Unknown",
              avatar_url: m.profile?.avatar_url,
              is_connected: m.profile?.is_connected ?? true,
            }))}
            size="md"
          />
        )}
      </div>
    </div>
  );
}
