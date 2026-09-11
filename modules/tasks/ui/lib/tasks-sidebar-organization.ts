import type {
  Task,
  TaskPriority,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import {
  formatAgentTypeKey,
  resolveTaskAssigneeLabel,
} from "./format-assignee.js";

export type TasksSidebarGroupBy =
  | "none"
  | "status"
  | "priority"
  | "assignee"
  | "project"
  | "due_date";

export type TasksSidebarSortBy =
  | "updated_at"
  | "created_at"
  | "title"
  | "status"
  | "identifier";

export type TasksSidebarAssigneeFilter =
  | "all"
  | "none"
  | `user:${string}`
  | `agent:${string}`;

export interface TasksSidebarTasksPrefs {
  assigneeFilter: TasksSidebarAssigneeFilter;
  groupBy: TasksSidebarGroupBy;
  sortBy: TasksSidebarSortBy;
  sortOrder: "asc" | "desc";
  status: string | "all";
}

export interface TasksSidebarPrefs {
  tasks: TasksSidebarTasksPrefs;
}

export interface TasksSidebarListGroup<T> {
  count: number;
  id: string;
  items: T[];
  label: string;
}

export interface TasksSidebarOrganizationLabels {
  assigneeUnassigned: string;
  dueLater: string;
  dueNoDate: string;
  dueOverdue: string;
  dueThisWeek: string;
  dueToday: string;
  dueTomorrow: string;
  priority: Record<TaskPriority, string>;
  projectNone: string;
  status: (statusId: string) => string;
}

export const DEFAULT_TASKS_SIDEBAR_PREFS: TasksSidebarPrefs = {
  tasks: {
    assigneeFilter: "all",
    groupBy: "status",
    sortBy: "updated_at",
    sortOrder: "desc",
    status: "all",
  },
};

const TASK_PRIORITIES: TaskPriority[] = ["critical", "high", "medium", "low"];

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function organizeSidebarTasks(params: {
  assigneeProfiles?: Map<string, { full_name: string; id: string }>;
  labels: TasksSidebarOrganizationLabels;
  now?: Date;
  prefs: TasksSidebarTasksPrefs;
  projectTitleById?: ReadonlyMap<string, string>;
  statusDefinitions: readonly TaskStatusDefinition[];
  tasks: readonly Task[];
}): TasksSidebarListGroup<Task>[] {
  const filtered = params.tasks
    .filter((task) => matchesTaskFilters(task, params.prefs))
    .toSorted((a, b) => compareTasks(a, b, params));

  if (params.prefs.groupBy === "none") {
    return [
      {
        count: filtered.length,
        id: "all",
        items: filtered,
        label: "",
      },
    ];
  }

  const groups = new Map<string, TasksSidebarListGroup<Task>>();
  for (const task of filtered) {
    const group = resolveTaskGroup(task, params);
    const existing = groups.get(group.id);
    if (existing) {
      existing.items.push(task);
      existing.count += 1;
    } else {
      groups.set(group.id, {
        ...group,
        count: 1,
        items: [task],
      });
    }
  }

  const list = [...groups.values()];
  if (params.prefs.groupBy === "due_date") {
    return sortDueDateGroups(list);
  }
  if (params.prefs.groupBy === "priority") {
    return list.toSorted(
      (a, b) =>
        (PRIORITY_ORDER[a.id.replace("priority:", "") as TaskPriority] ?? 99) -
        (PRIORITY_ORDER[b.id.replace("priority:", "") as TaskPriority] ?? 99)
    );
  }
  if (params.prefs.groupBy === "project") {
    // "no project" group goes last
    return list.toSorted((a, b) => {
      if (a.id === "project:none") {
        return 1;
      }
      if (b.id === "project:none") {
        return -1;
      }
      return compareText(a.label, b.label);
    });
  }
  return list.toSorted((a, b) => compareText(a.label, b.label));
}

function matchesTaskFilters(
  task: Task,
  prefs: TasksSidebarTasksPrefs
): boolean {
  if (prefs.status !== "all" && task.status !== prefs.status) {
    return false;
  }
  if (prefs.assigneeFilter === "all") {
    return true;
  }
  if (prefs.assigneeFilter === "none") {
    return task.primary_assignee_kind === "none";
  }
  if (prefs.assigneeFilter.startsWith("user:")) {
    const userId = prefs.assigneeFilter.slice("user:".length);
    return (
      task.primary_assignee_kind === "user" &&
      task.primary_assignee_user_id === userId
    );
  }
  if (prefs.assigneeFilter.startsWith("agent:")) {
    const agentKey = prefs.assigneeFilter.slice("agent:".length);
    return (
      task.primary_assignee_kind === "agent" &&
      task.primary_assignee_agent_type_key === agentKey
    );
  }
  return true;
}

function compareTasks(
  a: Task,
  b: Task,
  params: {
    assigneeProfiles?: Map<string, { full_name: string; id: string }>;
    labels: TasksSidebarOrganizationLabels;
    prefs: TasksSidebarTasksPrefs;
    statusDefinitions: readonly TaskStatusDefinition[];
  }
): number {
  const direction = params.prefs.sortOrder === "asc" ? 1 : -1;
  let result = 0;
  if (params.prefs.sortBy === "title") {
    result = compareText(a.title, b.title);
  } else if (params.prefs.sortBy === "status") {
    result = compareText(
      params.labels.status(a.status),
      params.labels.status(b.status)
    );
  } else if (params.prefs.sortBy === "identifier") {
    result = compareText(a.identifier, b.identifier);
  } else {
    result = compareText(a[params.prefs.sortBy], b[params.prefs.sortBy]);
  }
  return result === 0 ? compareText(a.id, b.id) : result * direction;
}

function resolveTaskGroup(
  task: Task,
  params: {
    assigneeProfiles?: Map<string, { full_name: string; id: string }>;
    labels: TasksSidebarOrganizationLabels;
    now?: Date;
    prefs: TasksSidebarTasksPrefs;
    projectTitleById?: ReadonlyMap<string, string>;
    statusDefinitions: readonly TaskStatusDefinition[];
  }
): Pick<TasksSidebarListGroup<Task>, "id" | "label"> {
  if (params.prefs.groupBy === "status") {
    return {
      id: `status:${task.status}`,
      label: params.labels.status(task.status),
    };
  }
  if (params.prefs.groupBy === "priority") {
    return {
      id: `priority:${task.priority}`,
      label: params.labels.priority[task.priority],
    };
  }
  if (params.prefs.groupBy === "assignee") {
    if (task.primary_assignee_kind === "none") {
      return {
        id: "assignee:none",
        label: params.labels.assigneeUnassigned,
      };
    }
    const label = resolveTaskAssigneeLabel(task, params.assigneeProfiles);
    const assigneeKey =
      task.primary_assignee_kind === "user"
        ? (task.primary_assignee_user_id ?? "unknown")
        : (task.primary_assignee_agent_type_key ?? "unknown");
    return {
      id: `assignee:${task.primary_assignee_kind}:${assigneeKey}`,
      label,
    };
  }
  if (params.prefs.groupBy === "project") {
    if (!task.project_id) {
      return { id: "project:none", label: params.labels.projectNone };
    }
    return {
      id: `project:${task.project_id}`,
      label: params.projectTitleById?.get(task.project_id) ?? task.project_id,
    };
  }
  const dueGroup = resolveDueDateGroup(
    task.due_date,
    params.labels,
    params.now
  );
  return { id: `due:${dueGroup.key}`, label: dueGroup.label };
}

function resolveDueDateGroup(
  dueDate: string | null,
  labels: TasksSidebarOrganizationLabels,
  now = new Date()
): { key: string; label: string } {
  if (!dueDate) {
    return { key: "none", label: labels.dueNoDate };
  }
  const due = new Date(dueDate);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfDayAfterTomorrow = new Date(startOfTomorrow);
  startOfDayAfterTomorrow.setDate(startOfDayAfterTomorrow.getDate() + 1);
  const startOfNextWeek = new Date(startOfToday);
  startOfNextWeek.setDate(startOfNextWeek.getDate() + 7);

  if (due < startOfToday) {
    return { key: "overdue", label: labels.dueOverdue };
  }
  if (due < startOfTomorrow) {
    return { key: "today", label: labels.dueToday };
  }
  if (due < startOfDayAfterTomorrow) {
    return { key: "tomorrow", label: labels.dueTomorrow };
  }
  if (due < startOfNextWeek) {
    return { key: "this-week", label: labels.dueThisWeek };
  }
  return { key: "later", label: labels.dueLater };
}

function sortDueDateGroups<T>(
  groups: TasksSidebarListGroup<T>[]
): TasksSidebarListGroup<T>[] {
  const order = ["overdue", "today", "tomorrow", "this-week", "later", "none"];
  return groups.toSorted(
    (a, b) =>
      order.indexOf(a.id.replace("due:", "")) -
      order.indexOf(b.id.replace("due:", ""))
  );
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function collectTaskAgentFilterOptions(
  tasks: readonly Task[]
): string[] {
  const keys = new Set<string>();
  for (const task of tasks) {
    if (
      task.primary_assignee_kind === "agent" &&
      task.primary_assignee_agent_type_key
    ) {
      keys.add(task.primary_assignee_agent_type_key);
    }
  }
  return [...keys].toSorted(compareText);
}

export function collectTaskUserFilterOptions(
  tasks: readonly Task[],
  assigneeProfiles?: Map<string, { full_name: string; id: string }>
): Array<{ id: string; label: string }> {
  const users = new Map<string, string>();
  for (const task of tasks) {
    if (
      task.primary_assignee_kind === "user" &&
      task.primary_assignee_user_id
    ) {
      const userId = task.primary_assignee_user_id;
      users.set(
        userId,
        assigneeProfiles?.get(userId)?.full_name ?? userId.slice(0, 8)
      );
    }
  }
  return [...users.entries()]
    .map(([id, label]) => ({ id, label }))
    .toSorted((a, b) => compareText(a.label, b.label));
}

export function formatTaskAgentFilterLabel(agentTypeKey: string): string {
  return formatAgentTypeKey(agentTypeKey);
}

export { TASK_PRIORITIES };
