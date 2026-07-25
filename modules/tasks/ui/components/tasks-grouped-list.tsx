import { useTranslation } from "@engenty/i18n/ui";
import { useMemo } from "react";
import type {
  Goal,
  Task,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { groupTasksByGoal } from "../lib/group-tasks-by-goal.js";
import { groupTasksForList } from "../lib/group-tasks-for-list.js";
import { GeneralTasksSection } from "./general-tasks-section.js";
import { GoalTasksSection } from "./goal-tasks-section.js";
import { TaskCard } from "./task-card.js";
import type { TasksGroupBy } from "./tasks-list-filter-bar.js";

interface TasksGroupedListProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  goals: Goal[];
  groupBy: TasksGroupBy;
  onAddGeneralTask?: () => void;
  onAddTaskToGoal?: (goalId: string) => void;
  onGoalEdit?: (goalId: string) => void;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void | Promise<void>;
  onTaskEdit?: (task: Task) => void;
  onTaskStatusChange?: (taskId: string, status: string) => void;
  projectTitleById?: ReadonlyMap<string, string>;
  showAssignee?: boolean;
  taskStatusDefinitions: TaskStatusDefinition[];
  tasks: Task[];
}

function TaskCardsBlock({
  assigneeProfiles,
  onTaskClick,
  onTaskDelete,
  onTaskEdit,
  onTaskStatusChange,
  showAssignee,
  taskStatusDefinitions,
  tasks,
}: {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  onTaskClick?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void | Promise<void>;
  onTaskEdit?: (task: Task) => void;
  onTaskStatusChange?: (taskId: string, status: string) => void;
  showAssignee: boolean;
  taskStatusDefinitions: TaskStatusDefinition[];
  tasks: Task[];
}) {
  return (
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
  );
}

export function TasksGroupedList({
  tasks,
  goals,
  groupBy,
  onAddGeneralTask,
  onAddTaskToGoal,
  onGoalEdit,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  onTaskStatusChange,
  projectTitleById,
  showAssignee = true,
  taskStatusDefinitions,
  assigneeProfiles,
}: TasksGroupedListProps) {
  const { t } = useTranslation("tasks");

  const goalGrouped = useMemo(
    () => (groupBy === "goal" ? groupTasksByGoal(tasks, goals) : null),
    [goals, groupBy, tasks]
  );

  const groups = useMemo(
    () =>
      groupBy === "goal"
        ? null
        : groupTasksForList({
            assigneeProfiles,
            goals,
            groupBy,
            labels: {
              agentPrefix: (agentKey) => `Agent: ${agentKey}`,
              generalTasks: t("list.generalTasks"),
              missingGoal: t("sidebar.missingGoal"),
              noProject: t("newTask.noProject"),
              priority: (priority) => t(`priority.${priority}`, priority),
              unassigned: t("sidebar.unassigned"),
            },
            projectTitleById,
            taskStatusDefinitions,
            tasks,
          }),
    [
      assigneeProfiles,
      goals,
      groupBy,
      projectTitleById,
      t,
      taskStatusDefinitions,
      tasks,
    ]
  );

  if (groupBy === "goal" && goalGrouped) {
    return (
      <div className="space-y-6 pb-6">
        <GeneralTasksSection
          assigneeProfiles={assigneeProfiles}
          onAddTask={onAddGeneralTask}
          onTaskClick={onTaskClick}
          onTaskDelete={onTaskDelete}
          onTaskEdit={onTaskEdit}
          onTaskStatusChange={onTaskStatusChange}
          showAssignee={showAssignee}
          taskStatusDefinitions={taskStatusDefinitions}
          tasks={goalGrouped.generalTasks}
        />
        {goalGrouped.goalSections.map((section) => (
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

  if (!groups) {
    return null;
  }

  if (groupBy === "none") {
    return (
      <div className="pb-6">
        <TaskCardsBlock
          assigneeProfiles={assigneeProfiles}
          onTaskClick={onTaskClick}
          onTaskDelete={onTaskDelete}
          onTaskEdit={onTaskEdit}
          onTaskStatusChange={onTaskStatusChange}
          showAssignee={showAssignee}
          taskStatusDefinitions={taskStatusDefinitions}
          tasks={groups[0]?.tasks ?? []}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {groups.map((group) => (
        <div className="space-y-3" key={group.id}>
          <h3 className="font-medium text-muted-foreground text-sm">
            {group.label}
          </h3>
          <TaskCardsBlock
            assigneeProfiles={assigneeProfiles}
            onTaskClick={onTaskClick}
            onTaskDelete={onTaskDelete}
            onTaskEdit={onTaskEdit}
            onTaskStatusChange={onTaskStatusChange}
            showAssignee={showAssignee}
            taskStatusDefinitions={taskStatusDefinitions}
            tasks={group.tasks}
          />
        </div>
      ))}
    </div>
  );
}
