import type { TasksRepo } from "../api/gateway-methods.js";
import type { Task, TaskSettings } from "../schema/types.js";

export type TasksBriefingMode = "personal" | "oversight";

export interface TasksBriefingSectionItem {
  reason: string;
  task: Task;
}

export interface TasksBriefingResponse {
  attention_items: TasksBriefingSectionItem[];
  focus_items: TasksBriefingSectionItem[];
  mode: TasksBriefingMode;
  stale_after_days: number;
  stale_items: TasksBriefingSectionItem[];
  waiting_items: TasksBriefingSectionItem[];
}

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

export function buildTasksBriefingSnapshot(
  tasks: Task[],
  settings: TaskSettings,
  opts: { mode: TasksBriefingMode; userId?: string | null }
): Omit<TasksBriefingResponse, "mode" | "stale_after_days"> {
  const staleDays = settings.stale_after_days;
  const userId = opts.mode === "personal" ? (opts.userId ?? null) : null;

  const focus_items: TasksBriefingSectionItem[] = [];
  const attention_items: TasksBriefingSectionItem[] = [];
  const waiting_items: TasksBriefingSectionItem[] = [];
  const stale_items: TasksBriefingSectionItem[] = [];

  for (const task of tasks) {
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

export async function buildTasksBriefingResponse(
  repo: Pick<TasksRepo, "getSettings" | "listTasksPaginated">,
  mode: TasksBriefingMode,
  principalId: string | undefined
): Promise<TasksBriefingResponse> {
  const settings = await repo.getSettings();
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
    userId: principalId ?? null,
  });

  return {
    mode,
    stale_after_days: settings.stale_after_days,
    ...snapshot,
  };
}
