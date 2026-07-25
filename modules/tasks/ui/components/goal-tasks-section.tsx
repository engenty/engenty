import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Calendar, Pencil, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  Goal,
  Task,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import { TaskCard } from "./task-card.js";

interface GoalTasksSectionProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  goal: Goal | { id: string; title: string; target_date?: string | null };
  onAddTask?: (goalId: string) => void;
  onGoalEdit?: (goalId: string) => void;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void | Promise<void>;
  onTaskEdit?: (task: Task) => void;
  onTaskStatusChange?: (taskId: string, status: string) => void;
  showAssignee?: boolean;
  taskStatusDefinitions: TaskStatusDefinition[];
  tasks: Task[];
}

export function GoalTasksSection({
  goal,
  onGoalEdit,
  onAddTask,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  onTaskStatusChange,
  showAssignee = true,
  taskStatusDefinitions,
  assigneeProfiles,
  tasks,
}: GoalTasksSectionProps) {
  const { t } = useTranslation("tasks");
  const targetDate =
    "target_date" in goal && goal.target_date
      ? new Date(goal.target_date).toLocaleDateString()
      : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="font-medium text-sm">
            <Link
              className="text-foreground hover:text-primary hover:underline"
              to={tasksPaths.goalDetail(goal.id)}
            >
              {goal.title}
            </Link>
          </h3>
          {onGoalEdit ? (
            <Button
              className="h-8 w-8 p-0"
              onClick={() => onGoalEdit(goal.id)}
              size="sm"
              variant="ghost"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {targetDate ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Calendar className="h-4 w-4" />
              <span>{targetDate}</span>
            </div>
          ) : null}
          {onAddTask ? (
            <Button
              className="h-auto p-0"
              onClick={() => onAddTask(goal.id)}
              size="sm"
              variant="link"
            >
              <Plus className="mr-1 h-4 w-4" />
              {t("list.addTask")}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="min-h-[50px]">
        {tasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("list.noGoalTasks")}
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
