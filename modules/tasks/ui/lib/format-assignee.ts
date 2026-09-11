import type { Task } from "../../src/schema/types.js";

/**
 * A run of a published Workflow carries a pseudo agent key
 * (`workflow:<uuid>`), because "agent" on that row means "headless", not "a
 * model". Nothing about that id is worth showing a person — split as a normal
 * key it renders as two chopped uuid fragments — so it resolves to the action's
 * own name where the caller has it, and to a plain label where it does not.
 */
export const ACTION_GRAPH_AGENT_KEY_PREFIX = "workflow:";

export function isActionRunAgentKey(key: string | null): boolean {
  return Boolean(key?.startsWith(ACTION_GRAPH_AGENT_KEY_PREFIX));
}

export function formatAgentTypeKey(key: string): string {
  if (isActionRunAgentKey(key)) {
    return "Action";
  }
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
