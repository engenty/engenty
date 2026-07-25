import type { InboxNotificationDto } from "@engenty/ai-ui/embed";

/** Approvals / proposals that block work until a human decides. */
export const HITL_KINDS = new Set([
  "tool_approval",
  "connection_approval_requested",
  "agent_proposed",
  "skill_proposed",
  "memory_proposal",
  "task_review_requested",
]);

/** Failures that need a human to fix or retry. */
export const ERROR_KINDS = new Set(["task_failed", "trigger_failed"]);

/** Union used by the "Needs your input" lane (HITL + errors). */
export const NEEDS_INPUT_KINDS = new Set([...HITL_KINDS, ...ERROR_KINDS]);

export type InboxKindFilter = "all" | "hitl" | "errors" | "updates";

export function isHitl(notification: InboxNotificationDto): boolean {
  return HITL_KINDS.has(notification.kind);
}

export function isError(notification: InboxNotificationDto): boolean {
  return ERROR_KINDS.has(notification.kind);
}

export function isNeedsInput(notification: InboxNotificationDto): boolean {
  return NEEDS_INPUT_KINDS.has(notification.kind);
}

export function matchesInboxKindFilter(
  notification: InboxNotificationDto,
  filter: InboxKindFilter
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "hitl") {
    return isHitl(notification);
  }
  if (filter === "errors") {
    return isError(notification);
  }
  return !(isHitl(notification) || isError(notification));
}

/** Open HITL items — drives the Plan tab badge. */
export function countOpenHitl(notifications: InboxNotificationDto[]): number {
  return notifications.filter(
    (n) => isHitl(n) && (n.status === "pending" || n.status === "delivered")
  ).length;
}
