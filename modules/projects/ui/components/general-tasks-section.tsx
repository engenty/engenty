import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Plus } from "lucide-react";
import type { PhaseTask, ProjectTaskStatusDefinition } from "../api.js";
import { TaskCard } from "./task-card.js";

interface GeneralTasksSectionProps {
  onAddTask?: () => void;
  onTaskDelete?: (taskId: string) => void;
  onTaskEdit?: (task: PhaseTask) => void;
  onTaskStatusChange?: (taskId: string, status: string) => void;
  onTaskVisibilityToggle?: (taskId: string, is_public: boolean) => void;
  showAssignees?: boolean;
  taskStatusDefinitions: ProjectTaskStatusDefinition[];
  tasks: PhaseTask[];
  viewMode?: "internal" | "external";
}

export function GeneralTasksSection({
  tasks,
  onAddTask,
  onTaskStatusChange,
  onTaskEdit,
  onTaskDelete,
  onTaskVisibilityToggle,
  showAssignees = true,
  viewMode = "internal",
  taskStatusDefinitions,
}: GeneralTasksSectionProps) {
  const { t } = useTranslation("projects");
  const { setNodeRef } = useDroppable({ id: "general-tasks" });
  const addTaskButton =
    onAddTask && viewMode === "internal" ? (
      <Button
        className="h-auto justify-start px-3 py-1.5 pl-8 text-muted-foreground"
        onClick={onAddTask}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Plus className="mr-1 h-4 w-4" />
        {t("detail.addTask")}
      </Button>
    ) : null;

  return (
    <div className="mt-6 space-y-3">
      <h3 className="font-medium text-lg">{t("detail.generalTasks")}</h3>
      <div className="min-h-[50px]" ref={setNodeRef}>
        {tasks.length === 0 ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              {t("detail.noGeneralTasks")}
            </p>
            {addTaskButton}
          </div>
        ) : (
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  onDelete={onTaskDelete}
                  onEdit={onTaskEdit}
                  onStatusChange={onTaskStatusChange}
                  onVisibilityToggle={onTaskVisibilityToggle}
                  showAssignees={showAssignees}
                  showVisibility={viewMode === "internal"}
                  task={task}
                  taskStatusDefinitions={taskStatusDefinitions}
                  viewMode={viewMode}
                />
              ))}
              {addTaskButton}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}
