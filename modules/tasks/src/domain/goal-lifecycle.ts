export type GoalStatus = "planned" | "active" | "achieved" | "cancelled";

export const GOAL_TERMINAL_STATUSES = new Set<GoalStatus>([
  "achieved",
  "cancelled",
]);

export function canTransitionGoalStatus(
  from: GoalStatus,
  to: GoalStatus
): boolean {
  if (from === to) {
    return true;
  }
  if (GOAL_TERMINAL_STATUSES.has(from)) {
    return false;
  }
  return true;
}

/** v1: max depth 3 (root → child → grandchild). */
export function assertGoalDepth(parentDepth: number | null): void {
  const depth = parentDepth ?? 0;
  if (depth >= 2) {
    throw new Error("goal_max_depth_exceeded");
  }
}
