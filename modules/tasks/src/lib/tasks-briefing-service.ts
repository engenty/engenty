import type { TasksRepo } from "../api/gateway-methods.js";
import type {
  Task,
  TaskActivity,
  TaskSettings,
  TasksBriefingActivityItem,
  TasksBriefingMode,
  TasksBriefingResponse,
  TasksBriefingSectionItem,
  TasksBriefingSummary,
} from "../schema/types.js";

const RECENT_TASKS_LIMIT = 10;
const RECENT_ACTIVITY_LIMIT = 10;

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86_400_000);
}

function isOverdue(task: Task): boolean {
  if (!task.due_date) {
    return false;
  }
  const due = new Date(task.due_date);
  return due.getTime() < Date.now() && task.status !== "done";
}

function isOpenTask(task: Task): boolean {
  return task.status !== "done" && task.status !== "cancelled";
}

function taskMatchesMode(
  task: Task,
  mode: TasksBriefingMode,
  userId: string | null
): boolean {
  if (mode !== "personal" || userId == null) {
    return true;
  }
  return task.primary_assignee_user_id === userId;
}

export function buildTasksBriefingSummary(
  tasks: Task[],
  settings: TaskSettings,
  opts: { mode: TasksBriefingMode; userId?: string | null }
): TasksBriefingSummary {
  const staleDays = settings.stale_after_days;
  const userId = opts.mode === "personal" ? (opts.userId ?? null) : null;

  let open = 0;
  let in_progress = 0;
  let blocked = 0;
  let waiting = 0;
  let stale = 0;
  let attention = 0;

  for (const task of tasks) {
    if (!taskMatchesMode(task, opts.mode, userId)) {
      continue;
    }

    if (!isOpenTask(task)) {
      continue;
    }

    open += 1;

    if (task.status === "in_progress") {
      in_progress += 1;
    }
    if (task.status === "blocked") {
      blocked += 1;
    }
    if (task.status === "request" || task.status === "blocked") {
      waiting += 1;
    }
    if (daysSince(task.updated_at) >= staleDays) {
      stale += 1;
    }
    if (
      isOverdue(task) ||
      task.priority === "critical" ||
      task.status === "blocked"
    ) {
      attention += 1;
    }
  }

  return {
    open,
    in_progress,
    blocked,
    waiting,
    stale,
    attention,
  };
}

export function buildTasksBriefingSnapshot(
  tasks: Task[],
  settings: TaskSettings,
  opts: { mode: TasksBriefingMode; userId?: string | null }
): Omit<
  TasksBriefingResponse,
  "mode" | "stale_after_days" | "summary" | "recent_tasks" | "recent_activity"
> {
  const staleDays = settings.stale_after_days;
  const userId = opts.mode === "personal" ? (opts.userId ?? null) : null;

  const focus_items: TasksBriefingSectionItem[] = [];
  const attention_items: TasksBriefingSectionItem[] = [];
  const waiting_items: TasksBriefingSectionItem[] = [];
  const stale_items: TasksBriefingSectionItem[] = [];

  for (const task of tasks) {
    if (!taskMatchesMode(task, opts.mode, userId)) {
      continue;
    }

    if (task.status === "in_progress") {
      const mine = userId != null && task.primary_assignee_user_id === userId;
      if (!userId || mine) {
        focus_items.push({ task, reason: "in_progress" });
      }
    }

    if (task.status === "request" || task.status === "blocked") {
      waiting_items.push({ task, reason: task.status });
    }

    if (
      isOverdue(task) ||
      task.priority === "critical" ||
      task.status === "blocked"
    ) {
      attention_items.push({
        task,
        reason: isOverdue(task)
          ? "overdue"
          : task.priority === "critical"
            ? "critical"
            : "blocked",
      });
    }

    if (
      task.status !== "done" &&
      task.status !== "cancelled" &&
      daysSince(task.updated_at) >= staleDays
    ) {
      stale_items.push({ task, reason: "stale" });
    }
  }

  return {
    focus_items: focus_items.slice(0, 12),
    attention_items: attention_items.slice(0, 12),
    waiting_items: waiting_items.slice(0, 12),
    stale_items: stale_items.slice(0, 12),
  };
}

function buildRecentTasks(
  tasks: Task[],
  mode: TasksBriefingMode,
  userId: string | null
): Task[] {
  return tasks
    .filter((task) => taskMatchesMode(task, mode, userId))
    .slice(0, RECENT_TASKS_LIMIT);
}

function buildRecentActivityItems(
  activity: TaskActivity[],
  tasksById: Map<string, Task>
): TasksBriefingActivityItem[] {
  return activity
    .map((item) => {
      const task = tasksById.get(item.task_id);
      if (!task) {
        return null;
      }
      return {
        activity: item,
        task_identifier: task.identifier,
        task_title: task.title,
      };
    })
    .filter((item): item is TasksBriefingActivityItem => item != null)
    .slice(0, RECENT_ACTIVITY_LIMIT);
}

export async function buildTasksBriefingResponse(
  repo: Pick<
    TasksRepo,
    "getSettings" | "listTasksPaginated" | "listRecentActivity"
  >,
  mode: TasksBriefingMode,
  principalId: string | undefined
): Promise<TasksBriefingResponse> {
  const settings = await repo.getSettings();
  const userId = principalId ?? null;
  const tasksPage = await repo.listTasksPaginated(
    {
      page: 1,
      pageSize: 200,
      scope: mode === "personal" ? "mine" : "all",
      sortBy: "updated_at",
      sortOrder: "desc",
    },
    principalId
  );

  const snapshot = buildTasksBriefingSnapshot(tasksPage.data, settings, {
    mode,
    userId,
  });
  const summary = buildTasksBriefingSummary(tasksPage.data, settings, {
    mode,
    userId,
  });
  const recent_tasks = buildRecentTasks(tasksPage.data, mode, userId);

  const taskIdsForActivity =
    mode === "personal"
      ? tasksPage.data
          .filter((task) => taskMatchesMode(task, mode, userId))
          .map((task) => task.id)
      : undefined;

  const recentActivityRows = await repo.listRecentActivity({
    limit: RECENT_ACTIVITY_LIMIT,
    taskIds: taskIdsForActivity,
  });

  const tasksById = new Map(tasksPage.data.map((task) => [task.id, task]));
  const recent_activity = buildRecentActivityItems(
    recentActivityRows,
    tasksById
  );

  return {
    mode,
    stale_after_days: settings.stale_after_days,
    summary,
    recent_tasks,
    recent_activity,
    ...snapshot,
  };
}
