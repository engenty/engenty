import { useTranslation } from "@engenty/i18n/ui";
import { useMemo } from "react";
import type { Task, TaskStatusDefinition } from "../../src/schema/types.js";
import { groupTasksForList } from "../lib/group-tasks-for-list.js";
import { TaskCard } from "./task-card.js";
import type { TasksGroupBy } from "./tasks-list-filter-bar.js";

interface TasksGroupedListProps {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  groupBy: TasksGroupBy;
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
  groupBy,
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

  const groups = useMemo(
    () =>
      groupTasksForList({
        assigneeProfiles,
        groupBy,
        labels: {
          agentPrefix: (agentKey) => `Agent: ${agentKey}`,
          generalTasks: t("list.generalTasks"),
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
      groupBy,
      projectTitleById,
      t,
      taskStatusDefinitions,
      tasks,
    ]
  );

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
