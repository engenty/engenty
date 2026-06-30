import { useCallback, useEffect, useRef, useState } from "react";
import type { GoalStatus } from "../../src/schema/types.js";
import {
  DEFAULT_TASKS_SIDEBAR_PREFS,
  type GoalsSidebarGroupBy,
  type GoalsSidebarSortBy,
  type TasksSidebarGroupBy,
  type TasksSidebarPrefs,
  type TasksSidebarSortBy,
  type TasksSidebarTab,
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

const VALID_TABS = new Set<TasksSidebarTab>(["tasks", "goals", "routines"]);
const VALID_TASK_GROUP_BY = new Set<TasksSidebarGroupBy>([
  "none",
  "status",
  "priority",
  "assignee",
  "goal",
  "due_date",
]);
const VALID_GOAL_GROUP_BY = new Set<GoalsSidebarGroupBy>(["none", "status"]);
const VALID_TASK_SORT_BY = new Set<TasksSidebarSortBy>([
  "updated_at",
  "created_at",
  "title",
  "status",
  "identifier",
]);
const VALID_GOAL_SORT_BY = new Set<GoalsSidebarSortBy>([
  "updated_at",
  "created_at",
  "title",
  "status",
]);
const VALID_GOAL_STATUS = new Set<GoalStatus | "all">([
  "all",
  "planned",
  "active",
  "achieved",
  "cancelled",
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

function mergeGoalsPrefs(
  stored: Partial<TasksSidebarPrefs["goals"]> | undefined
): TasksSidebarPrefs["goals"] {
  const defaults = DEFAULT_TASKS_SIDEBAR_PREFS.goals;
  return {
    groupBy:
      stored?.groupBy && VALID_GOAL_GROUP_BY.has(stored.groupBy)
        ? stored.groupBy
        : defaults.groupBy,
    sortBy:
      stored?.sortBy && VALID_GOAL_SORT_BY.has(stored.sortBy)
        ? stored.sortBy
        : defaults.sortBy,
    sortOrder:
      stored?.sortOrder === "asc" || stored?.sortOrder === "desc"
        ? stored.sortOrder
        : defaults.sortOrder,
    status:
      stored?.status && VALID_GOAL_STATUS.has(stored.status)
        ? stored.status
        : defaults.status,
  };
}

function mergePrefs(
  stored: Partial<TasksSidebarPrefs> | null
): TasksSidebarPrefs {
  return {
    tab:
      stored?.tab && VALID_TABS.has(stored.tab)
        ? stored.tab
        : DEFAULT_TASKS_SIDEBAR_PREFS.tab,
    tasks: mergeTasksPrefs(stored?.tasks),
    goals: mergeGoalsPrefs(stored?.goals),
  };
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

  const setTab = useCallback((tab: TasksSidebarTab) => {
    setPrefs((current) => ({ ...current, tab }));
  }, []);

  const updateTasksPrefs = useCallback(
    (updater: (current: TasksSidebarTasksPrefs) => TasksSidebarTasksPrefs) => {
      setPrefs((current) => ({
        ...current,
        tasks: updater(current.tasks),
      }));
    },
    []
  );

  const updateGoalsPrefs = useCallback(
    (
      updater: (
        current: TasksSidebarPrefs["goals"]
      ) => TasksSidebarPrefs["goals"]
    ) => {
      setPrefs((current) => ({
        ...current,
        goals: updater(current.goals),
      }));
    },
    []
  );

  return {
    prefs,
    setTab,
    updateGoalsPrefs,
    updateTasksPrefs,
  };
}
