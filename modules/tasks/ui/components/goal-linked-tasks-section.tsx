import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Card,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  STICKY_HEADER_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { Link2, Plus, Unlink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Task, TaskStatusDefinition } from "../../src/schema/types.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import {
  tasksListOptions,
  useUpdateTasksListMutation,
} from "../tasks-queries.js";
import { TaskStatusBadge } from "./task-status-badge.js";

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
  const [unlinkingTaskId, setUnlinkingTaskId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(taskSearch.trim(), 200);

  const updateListMutation = useUpdateTasksListMutation({
    goal_id: goalId,
    page: 1,
    pageSize: 100,
  });

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
    setUnlinkingTaskId(taskId);
    try {
      await updateListMutation.mutateAsync({
        taskId,
        input: { goal_id: null },
      });
    } catch {
      toast.error(t("goals.unlinkTaskFailed"));
    } finally {
      setUnlinkingTaskId(null);
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

      <Card variant="form">
        {linkedTasksLoading ? (
          <p className="text-muted-foreground text-sm">…</p>
        ) : linkedTasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("goals.noLinkedTasks")}
          </p>
        ) : (
          <div className="overflow-auto rounded-lg border">
            <Table noWrapper>
              <TableHeader className={STICKY_HEADER_CLASS}>
                <TableRow>
                  <TableHead>{t("list.identifier")}</TableHead>
                  <TableHead>{t("list.titleColumn")}</TableHead>
                  <TableHead>{t("list.status")}</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">{t("goals.unlinkTask")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedTasks.map((task) => (
                  <TableRow
                    className="cursor-pointer"
                    key={task.id}
                    onClick={() => navigate(tasksPaths.taskDetail(task.id))}
                  >
                    <TableCell className="font-mono text-xs">
                      {task.identifier}
                    </TableCell>
                    <TableCell>
                      <Link
                        className="hover:underline"
                        onClick={(event) => event.stopPropagation()}
                        to={tasksPaths.taskDetail(task.id)}
                      >
                        {task.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <TaskStatusBadge
                        compact
                        definitions={taskStatusDefinitions}
                        status={task.status}
                      />
                    </TableCell>
                    <TableCell>
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              aria-label={t("goals.unlinkTask")}
                              className="h-8 w-8"
                              disabled={
                                unlinkingTaskId === task.id ||
                                updateListMutation.isPending
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleUnlinkTask(task.id);
                              }}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Unlink className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {t("goals.unlinkTask")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </section>
  );
}
