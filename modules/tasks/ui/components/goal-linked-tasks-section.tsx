import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import {
  Ban,
  Link2,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Unlink,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Task, TaskStatusDefinition } from "../../src/schema/types.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import {
  tasksListOptions,
  useDeleteTaskMutation,
  useUpdateTasksListMutation,
} from "../tasks-queries.js";
import { statusIconForDefinition } from "./task-card.js";
import {
  resolveTaskStatusLabel,
  TaskStatusBadge,
} from "./task-status-badge.js";

interface GoalLinkedTasksSectionProps {
  goalId: string;
  linkedTasks: Task[];
  linkedTasksLoading: boolean;
  onCreateTask: (goalId: string) => void;
  taskStatusDefinitions: TaskStatusDefinition[];
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

const TERMINAL_STATUSES = new Set(["done", "cancelled"]);

export function GoalLinkedTasksSection({
  goalId,
  linkedTasks,
  linkedTasksLoading,
  onCreateTask,
  taskStatusDefinitions,
}: GoalLinkedTasksSectionProps) {
  const { t } = useTranslation("tasks");
  const navigate = useNavigate();
  const [linkOpen, setLinkOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const debouncedSearch = useDebouncedValue(taskSearch.trim(), 200);

  const updateListMutation = useUpdateTasksListMutation({
    goal_id: goalId,
    page: 1,
    pageSize: 100,
  });
  const deleteMutation = useDeleteTaskMutation();

  const linkableTasksQuery = useQuery({
    ...tasksListOptions({
      page: 1,
      pageSize: 100,
      search: debouncedSearch || null,
      sortBy: "updated_at",
      sortOrder: "desc",
    }),
    enabled: linkOpen,
  });

  const linkedTaskIds = useMemo(
    () => new Set(linkedTasks.map((task) => task.id)),
    [linkedTasks]
  );

  const linkableTasks = useMemo(
    () =>
      (linkableTasksQuery.data?.data ?? []).filter(
        (task) => !linkedTaskIds.has(task.id)
      ),
    [linkableTasksQuery.data?.data, linkedTaskIds]
  );

  const handleLinkTask = async (taskId: string) => {
    try {
      await updateListMutation.mutateAsync({
        taskId,
        input: { goal_id: goalId },
      });
      setLinkOpen(false);
      setTaskSearch("");
    } catch {
      toast.error(t("goals.linkTaskFailed"));
    }
  };

  const handleUnlinkTask = async (taskId: string) => {
    setPendingTaskId(taskId);
    try {
      await updateListMutation.mutateAsync({
        taskId,
        input: { goal_id: null },
      });
    } catch {
      toast.error(t("goals.unlinkTaskFailed"));
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleStatusChange = async (taskId: string, status: string) => {
    setPendingTaskId(taskId);
    try {
      await updateListMutation.mutateAsync({ taskId, input: { status } });
    } catch {
      toast.error(t("list.statusUpdateFailed"));
    } finally {
      setPendingTaskId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTask) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(deleteTask.id);
      setDeleteTask(null);
    } catch {
      toast.error(t("list.deleteFailed"));
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-sm">{t("goals.linkedTasksTitle")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Popover
            onOpenChange={(open) => {
              setLinkOpen(open);
              if (!open) {
                setTaskSearch("");
              }
            }}
            open={linkOpen}
          >
            <PopoverTrigger asChild>
              <Button size="sm" type="button" variant="outline">
                <Link2 className="mr-1.5 h-4 w-4" />
                {t("goals.linkExistingTask")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  onValueChange={setTaskSearch}
                  placeholder={t("goals.searchTasks")}
                  value={taskSearch}
                />
                <CommandList className="max-h-56">
                  <CommandEmpty>
                    {linkableTasksQuery.isLoading
                      ? "…"
                      : t("goals.noTaskMatch")}
                  </CommandEmpty>
                  <CommandGroup>
                    {linkableTasks.map((task) => (
                      <CommandItem
                        className="flex items-center gap-2"
                        key={task.id}
                        keywords={[task.identifier, task.title]}
                        onSelect={() => void handleLinkTask(task.id)}
                        value={`${task.identifier} ${task.title}`}
                      >
                        <span className="font-mono text-muted-foreground text-xs">
                          {task.identifier}
                        </span>
                        <span className="truncate">{task.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button
            onClick={() => onCreateTask(goalId)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t("list.newTask")}
          </Button>
        </div>
      </div>

      {linkedTasksLoading ? (
        <p className="text-muted-foreground text-sm">…</p>
      ) : linkedTasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("goals.noLinkedTasks")}
        </p>
      ) : (
        <div className="space-y-2">
          {linkedTasks.map((task) => {
            const currentDef =
              taskStatusDefinitions.find((d) => d.id === task.status) ??
              ({
                id: task.status,
                label: task.status,
                color: "slate",
              } satisfies TaskStatusDefinition);
            const isTerminal = TERMINAL_STATUSES.has(task.status);
            const busy =
              pendingTaskId === task.id || updateListMutation.isPending;
            return (
              <div
                className="flex select-none items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50"
                key={task.id}
              >
                {/* Leading status dot → full status picker */}
                <DropdownMenu>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="flex shrink-0 items-center justify-center rounded-md p-1 hover:bg-muted"
                            type="button"
                          >
                            {statusIconForDefinition(currentDef, "md")}
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {resolveTaskStatusLabel(
                          task.status,
                          taskStatusDefinitions
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenuContent align="start" className="w-56">
                    {taskStatusDefinitions.map((def) => (
                      <DropdownMenuItem
                        className="gap-2"
                        key={def.id}
                        onClick={() => {
                          if (def.id !== task.status) {
                            void handleStatusChange(task.id, def.id);
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

                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate(tasksPaths.taskDetail(task.id))}
                  type="button"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "truncate font-medium",
                        isTerminal &&
                          task.status === "done" &&
                          "text-muted-foreground line-through"
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
                  <div className="mt-1 font-mono text-muted-foreground text-xs">
                    {task.identifier}
                  </div>
                </button>

                {/* 3-dot menu: quick status + unlink + delete */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={t("detail.actionsMenu")}
                      className="h-8 w-8 shrink-0 p-0 text-muted-foreground"
                      disabled={busy}
                      size="sm"
                      variant="ghost"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {isTerminal ? (
                      <DropdownMenuItem
                        onClick={() => void handleStatusChange(task.id, "todo")}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t("list.reopenTask")}
                      </DropdownMenuItem>
                    ) : (
                      <>
                        {task.status !== "in_progress" && (
                          <DropdownMenuItem
                            onClick={() =>
                              void handleStatusChange(task.id, "in_progress")
                            }
                          >
                            <Play className="mr-2 h-4 w-4" />
                            {t("list.startTask")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() =>
                            void handleStatusChange(task.id, "cancelled")
                          }
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          {t("list.cancelTask")}
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => void handleUnlinkTask(task.id)}
                    >
                      <Unlink className="mr-2 h-4 w-4" />
                      {t("goals.unlinkTask")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTask(task)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("delete.action")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteTask(null)}
        open={deleteTask !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete.confirmDescription", {
                title: deleteTask?.title ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("edit.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDeleteConfirm()}
            >
              {t("delete.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
