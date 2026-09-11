import type { Task, TaskStatusDefinition } from "../../src/schema/types.js";
import type { TasksGroupBy } from "../components/tasks-list-filter-bar.js";

export interface TaskListGroup {
  id: string;
  label: string;
  tasks: Task[];
}

export function groupTasksForList(params: {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  groupBy: TasksGroupBy;
  labels: {
    agentPrefix: (agentKey: string) => string;
    generalTasks: string;
    noProject: string;
    priority: (priority: string) => string;
    unassigned: string;
  };
  projectTitleById?: ReadonlyMap<string, string>;
  taskStatusDefinitions: readonly TaskStatusDefinition[];
  tasks: readonly Task[];
}): TaskListGroup[] {
  const { groupBy, tasks } = params;

  if (groupBy === "none") {
    return [{ id: "all", label: "", tasks: [...tasks] }];
  }

  if (groupBy === "status") {
    const byStatus = new Map<string, Task[]>();
    const statusOrder = params.taskStatusDefinitions.map((d) => d.id);
    for (const id of statusOrder) {
      byStatus.set(id, []);
    }
    const fallback = statusOrder[0] ?? "todo";
    for (const task of tasks) {
      const key = statusOrder.includes(task.status) ? task.status : fallback;
      const list = byStatus.get(key) ?? [];
      list.push(task);
      byStatus.set(key, list);
    }
    return statusOrder
      .map((statusId) => {
        const def = params.taskStatusDefinitions.find((d) => d.id === statusId);
        return {
          id: statusId,
          label: def?.label ?? statusId,
          tasks: byStatus.get(statusId) ?? [],
        };
      })
      .filter((g) => g.tasks.length > 0);
  }

  if (groupBy === "priority") {
    const priorityOrder = ["critical", "high", "medium", "low"] as const;
    const byPriority = new Map<string, Task[]>();
    for (const p of priorityOrder) {
      byPriority.set(p, []);
    }
    for (const task of tasks) {
      const p = task.priority ?? "medium";
      const list = byPriority.get(p) ?? [];
      list.push(task);
      byPriority.set(p, list);
    }
    return priorityOrder
      .map((priority) => ({
        id: priority,
        label: params.labels.priority(priority),
        tasks: byPriority.get(priority) ?? [],
      }))
      .filter((g) => g.tasks.length > 0);
  }

  if (groupBy === "assignee") {
    const byAssignee = new Map<string, Task[]>();
    for (const task of tasks) {
      let key = "unassigned";
      if (
        task.primary_assignee_kind === "user" &&
        task.primary_assignee_user_id
      ) {
        key = `user:${task.primary_assignee_user_id}`;
      } else if (
        task.primary_assignee_kind === "agent" &&
        task.primary_assignee_agent_type_key
      ) {
        key = `agent:${task.primary_assignee_agent_type_key}`;
      }
      const list = byAssignee.get(key) ?? [];
      list.push(task);
      byAssignee.set(key, list);
    }

    return Array.from(byAssignee.entries())
      .map(([key, groupTasks]) => {
        let label = params.labels.unassigned;
        if (key.startsWith("user:")) {
          const userId = key.slice(5);
          label = params.assigneeProfiles?.get(userId)?.full_name ?? userId;
        } else if (key.startsWith("agent:")) {
          label = params.labels.agentPrefix(key.slice(6));
        }
        return { id: key, label, tasks: groupTasks };
      })
      .toSorted((a, b) => a.label.localeCompare(b.label));
  }

  if (groupBy === "project") {
    const byProject = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = task.project_id ?? "none";
      const list = byProject.get(key) ?? [];
      list.push(task);
      byProject.set(key, list);
    }
    return Array.from(byProject.entries())
      .map(([key, groupTasks]) => {
        let label = params.labels.noProject;
        if (key !== "none") {
          label = params.projectTitleById?.get(key) ?? key;
        }
        return { id: key, label, tasks: groupTasks };
      })
      .toSorted((a, b) => {
        if (a.id === "none") {
          return 1;
        }
        if (b.id === "none") {
          return -1;
        }
        return a.label.localeCompare(b.label);
      });
  }

  return [{ id: "all", label: "", tasks: [...tasks] }];
}
