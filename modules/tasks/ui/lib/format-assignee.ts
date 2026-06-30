import type { Task } from "../../src/schema/types.js";

export function formatAgentTypeKey(key: string): string {
  const segments = key.split(/[./_-]+/).filter(Boolean);
  const raw =
    segments.length > 1
      ? segments.slice(-2).join(" ")
      : (segments[0] ?? key).replace(/[_-]+/g, " ");
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveTaskAssigneeLabel(
  task: Task,
  assigneeProfiles?: Map<string, { full_name: string; id: string }>
): string {
  if (task.primary_assignee_kind === "user") {
    const userId = task.primary_assignee_user_id;
    if (!userId) {
      return "—";
    }
    return assigneeProfiles?.get(userId)?.full_name ?? userId.slice(0, 8);
  }
  if (task.primary_assignee_kind === "agent") {
    const key = task.primary_assignee_agent_type_key;
    return key ? formatAgentTypeKey(key) : "—";
  }
  return "—";
}
