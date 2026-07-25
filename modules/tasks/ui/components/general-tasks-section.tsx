import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Plus } from "lucide-react";
import type { Task, TaskStatusDefinition } from "../../src/schema/types.js";
import { TaskCard } from "./task-card.js";

interface GeneralTasksSectionProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  onAddTask?: () => void;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void | Promise<void>;
  onTaskEdit?: (task: Task) => void;
  onTaskStatusChange?: (taskId: string, status: string) => void;
  showAssignee?: boolean;
  taskStatusDefinitions: TaskStatusDefinition[];
  tasks: Task[];
}

export function GeneralTasksSection({
  tasks,
  onAddTask,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  onTaskStatusChange,
  showAssignee = true,
  taskStatusDefinitions,
  assigneeProfiles,
}: GeneralTasksSectionProps) {
  const { t } = useTranslation("tasks");

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-muted-foreground text-sm">
          {t("list.generalTasks")}
        </h3>
        {onAddTask ? (
          <Button
            className="h-auto p-0"
            onClick={onAddTask}
            size="sm"
            variant="link"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("list.addTask")}
          </Button>
        ) : null}
      </div>
      <div className="min-h-[50px]">
        {tasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("list.noGeneralTasks")}
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <TaskCard
                assigneeProfiles={assigneeProfiles}
                key={task.id}
                onClick={onTaskClick}
                onDelete={onTaskDelete}
                onEdit={onTaskEdit}
                onStatusChange={onTaskStatusChange}
                showAssignee={showAssignee}
                task={task}
                taskStatusDefinitions={taskStatusDefinitions}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
