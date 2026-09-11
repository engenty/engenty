import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_TASKS_SIDEBAR_PREFS,
  type TasksSidebarGroupBy,
  type TasksSidebarPrefs,
  type TasksSidebarSortBy,
  type TasksSidebarTasksPrefs,
} from "./tasks-sidebar-organization.js";

const STORAGE_KEY = "engenty.tasks-sidebar-prefs";

function loadStoredPrefs(): Partial<TasksSidebarPrefs> | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Partial<TasksSidebarPrefs>;
  } catch {
    return null;
  }
}

function saveStoredPrefs(prefs: TasksSidebarPrefs): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // quota exceeded or private mode
  }
}

const VALID_TASK_GROUP_BY = new Set<TasksSidebarGroupBy>([
  "none",
  "status",
  "priority",
  "assignee",
  "due_date",
]);
const VALID_TASK_SORT_BY = new Set<TasksSidebarSortBy>([
  "updated_at",
  "created_at",
  "title",
  "status",
  "identifier",
]);

function mergeTasksPrefs(
  stored: Partial<TasksSidebarTasksPrefs> | undefined
): TasksSidebarTasksPrefs {
  const defaults = DEFAULT_TASKS_SIDEBAR_PREFS.tasks;
  return {
    assigneeFilter:
      stored?.assigneeFilter &&
      (stored.assigneeFilter === "all" ||
        stored.assigneeFilter === "none" ||
        stored.assigneeFilter.startsWith("user:") ||
        stored.assigneeFilter.startsWith("agent:"))
        ? stored.assigneeFilter
        : defaults.assigneeFilter,
    groupBy:
      stored?.groupBy && VALID_TASK_GROUP_BY.has(stored.groupBy)
        ? stored.groupBy
        : defaults.groupBy,
    sortBy:
      stored?.sortBy && VALID_TASK_SORT_BY.has(stored.sortBy)
        ? stored.sortBy
        : defaults.sortBy,
    sortOrder:
      stored?.sortOrder === "asc" || stored?.sortOrder === "desc"
        ? stored.sortOrder
        : defaults.sortOrder,
    status:
      stored?.status === "all" ||
      (typeof stored?.status === "string" && stored.status.length > 0)
        ? (stored.status ?? defaults.status)
        : defaults.status,
  };
}

function mergePrefs(
  stored: Partial<TasksSidebarPrefs> | null
): TasksSidebarPrefs {
  return { tasks: mergeTasksPrefs(stored?.tasks) };
}

export function useTasksSidebarPrefs() {
  const [prefs, setPrefs] = useState<TasksSidebarPrefs>(() =>
    mergePrefs(loadStoredPrefs())
  );
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    saveStoredPrefs(prefs);
  }, [prefs]);

  const updateTasksPrefs = useCallback(
    (updater: (current: TasksSidebarTasksPrefs) => TasksSidebarTasksPrefs) => {
      setPrefs((current) => ({
        ...current,
        tasks: updater(current.tasks),
      }));
    },
    []
  );

  return { prefs, updateTasksPrefs };
}
