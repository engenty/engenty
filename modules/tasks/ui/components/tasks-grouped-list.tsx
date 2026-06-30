import { useMemo } from "react";
import type {
  Goal,
  Task,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { groupTasksByGoal } from "../lib/group-tasks-by-goal.js";
import { GeneralTasksSection } from "./general-tasks-section.js";
import { GoalTasksSection } from "./goal-tasks-section.js";

interface TasksGroupedListProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  goals: Goal[];
  onAddGeneralTask?: () => void;
  onAddTaskToGoal?: (goalId: string) => void;
  onGoalEdit?: (goalId: string) => void;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void | Promise<void>;
  onTaskEdit?: (task: Task) => void;
  onTaskStatusChange?: (taskId: string, status: string) => void;
  showAssignee?: boolean;
  taskStatusDefinitions: TaskStatusDefinition[];
  tasks: Task[];
}

export function TasksGroupedList({
  tasks,
  goals,
  onAddGeneralTask,
  onAddTaskToGoal,
  onGoalEdit,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  onTaskStatusChange,
  showAssignee = true,
  taskStatusDefinitions,
  assigneeProfiles,
}: TasksGroupedListProps) {
  const { generalTasks, goalSections } = useMemo(
    () => groupTasksByGoal(tasks, goals),
    [tasks, goals]
  );

  return (
    <div className="pb-6">
      <GeneralTasksSection
        assigneeProfiles={assigneeProfiles}
        onAddTask={onAddGeneralTask}
        onTaskClick={onTaskClick}
        onTaskDelete={onTaskDelete}
        onTaskEdit={onTaskEdit}
        onTaskStatusChange={onTaskStatusChange}
        showAssignee={showAssignee}
        taskStatusDefinitions={taskStatusDefinitions}
        tasks={generalTasks}
      />
      {goalSections.map((section) => (
        <GoalTasksSection
          assigneeProfiles={assigneeProfiles}
          goal={section.goal}
          key={section.goal.id}
          onAddTask={onAddTaskToGoal}
          onGoalEdit={onGoalEdit}
          onTaskClick={onTaskClick}
          onTaskDelete={onTaskDelete}
          onTaskEdit={onTaskEdit}
          onTaskStatusChange={onTaskStatusChange}
          showAssignee={showAssignee}
          taskStatusDefinitions={taskStatusDefinitions}
          tasks={section.tasks}
        />
      ))}
    </div>
  );
}
