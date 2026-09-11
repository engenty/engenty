/**
 * Compact, agent-friendly snapshots for preloaded tasks copilot context.
 */
import type {
  Task,
  TaskDetail,
  TasksBriefingResponse,
} from "../src/schema/types.js";

export interface TaskSnapshot {
  checkout_run_id: string | null;
  comment_count: number;
  description: string | null;
  due_date: string | null;
  identifier: string;
  primary_assignee_agent_type_key: string | null;
  primary_assignee_kind: string;
  primary_assignee_user_id: string | null;
  priority: string;
  recent_comments: { content: string }[];
  status: string;
  title: string;
}

export interface TaskPreviewItem {
  id: string;
  identifier: string;
  priority: string;
  status: string;
  title: string;
}

export interface TasksBriefingSnapshot {
  attention_count: number;
  attention_tasks: TaskPreviewItem[];
  focus_count: number;
  focus_tasks: TaskPreviewItem[];
  mode: TasksBriefingResponse["mode"];
  stale_after_days: number;
  stale_count: number;
  stale_tasks: TaskPreviewItem[];
  waiting_count: number;
  waiting_tasks: TaskPreviewItem[];
}

function trimDescription(value: string | null, maxLen = 400): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function toTaskPreviewItem(task: Task): TaskPreviewItem {
  return {
    id: task.id,
    identifier: task.identifier,
    title: task.title,
    status: task.status,
    priority: task.priority,
  };
}

/** Build a compact task snapshot for Agent UI state page.task_snapshot. */
export function buildTaskSnapshot(task: TaskDetail): TaskSnapshot {
  const recentComments = (task.comments ?? []).slice(-3).map((comment) => ({
    content: comment.content,
  }));

  return {
    identifier: task.identifier,
    title: task.title,
    status: task.status,
    priority: task.priority,
    description: trimDescription(task.description),
    due_date: task.due_date,
    primary_assignee_kind: task.primary_assignee_kind,
    primary_assignee_user_id: task.primary_assignee_user_id,
    primary_assignee_agent_type_key: task.primary_assignee_agent_type_key,
    checkout_run_id: task.checkout_run_id,
    comment_count: task.comments?.length ?? 0,
    recent_comments: recentComments,
  };
}

/** Build a capped tasks preview for Agent UI state page.tasks_preview. */
export function buildTasksPreview(
  tasks: Task[],
  limit = 10
): TaskPreviewItem[] {
  return tasks.slice(0, limit).map(toTaskPreviewItem);
}

function briefingSectionToPreview(
  items: TasksBriefingResponse["focus_items"],
  limit = 5
): TaskPreviewItem[] {
  return items.slice(0, limit).map(({ task }) => toTaskPreviewItem(task));
}

/** Build a compact briefing snapshot for Agent UI state page.tasks_briefing_snapshot. */
export function buildBriefingSnapshot(
  briefing: TasksBriefingResponse
): TasksBriefingSnapshot {
  return {
    mode: briefing.mode,
    stale_after_days: briefing.stale_after_days,
    focus_count: briefing.focus_items.length,
    focus_tasks: briefingSectionToPreview(briefing.focus_items),
    attention_count: briefing.attention_items.length,
    attention_tasks: briefingSectionToPreview(briefing.attention_items),
    waiting_count: briefing.waiting_items.length,
    waiting_tasks: briefingSectionToPreview(briefing.waiting_items),
    stale_count: briefing.stale_items.length,
    stale_tasks: briefingSectionToPreview(briefing.stale_items),
  };
}
