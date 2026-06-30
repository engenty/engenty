/** Canonical task status ids — aligned with projects task-status-builtins (lift in Phase 1). */
export const TASK_TERMINAL_STATUSES = new Set(["done", "cancelled"]);

export const TASK_AGENT_CHECKOUT_ENTRY_STATUSES = new Set(["todo", "backlog"]);

export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "request"
  | "done"
  | "cancelled"
  | "blocked";

export type TaskTransitionActorKind = "user" | "agent";

export interface TaskTransitionInput {
  actorKind: TaskTransitionActorKind;
  from: TaskStatus;
  /** When true, agent holds an active checkout on this task. */
  hasActiveCheckout?: boolean;
  to: TaskStatus;
}

/**
 * Validates whether a status transition is allowed.
 * Agents must not set in_progress without checkout (enforced at API layer too).
 */
export function canTransitionTaskStatus(input: TaskTransitionInput): boolean {
  const { actorKind, from, to, hasActiveCheckout } = input;

  if (from === to) {
    return true;
  }

  if (TASK_TERMINAL_STATUSES.has(to)) {
    return true;
  }

  if (to === "in_progress" && actorKind === "agent" && !hasActiveCheckout) {
    return false;
  }

  return true;
}

/** Format tenant task identifier, e.g. ENG-142 */
export function formatTaskIdentifier(prefix: string, sequence: number): string {
  const normalizedPrefix = prefix
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!normalizedPrefix) {
    throw new Error("task_identifier_prefix_required");
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("task_identifier_sequence_invalid");
  }
  return `${normalizedPrefix}-${sequence}`;
}

const TASK_IDENTIFIER_PATTERN = /^[A-Z0-9]+-\d+$/;

export function isValidTaskIdentifier(value: string): boolean {
  return TASK_IDENTIFIER_PATTERN.test(value.trim());
}

export type PrimaryAssigneeKind = "user" | "agent" | "none";

export interface TaskAssigneeShape {
  collaborator_user_ids: string[];
  primary_assignee_agent_type_key: string | null;
  primary_assignee_kind: PrimaryAssigneeKind;
  primary_assignee_user_id: string | null;
}

/** Primary assignee is singular; collaborators are additive. */
export function normalizeTaskAssignees(input: {
  collaborator_user_ids?: string[] | null;
  primary_assignee_agent_type_key?: string | null;
  primary_assignee_kind?: PrimaryAssigneeKind | null;
  primary_assignee_user_id?: string | null;
}): TaskAssigneeShape {
  const kind = input.primary_assignee_kind ?? "none";
  const userId = input.primary_assignee_user_id?.trim() || null;
  const agentKey = input.primary_assignee_agent_type_key?.trim() || null;

  if (kind === "user" && !userId) {
    throw new Error("primary_assignee_user_required");
  }
  if (kind === "agent" && !agentKey) {
    throw new Error("primary_assignee_agent_required");
  }
  if (kind === "none" && (userId || agentKey)) {
    throw new Error("primary_assignee_kind_none_conflict");
  }

  const collaborators = [
    ...new Set(
      (input.collaborator_user_ids ?? []).map((id) => id.trim()).filter(Boolean)
    ),
  ].filter((id) => !(kind === "user" && id === userId));

  return {
    collaborator_user_ids: collaborators,
    primary_assignee_agent_type_key: kind === "agent" ? agentKey : null,
    primary_assignee_kind: kind,
    primary_assignee_user_id: kind === "user" ? userId : null,
  };
}

/** Resolve goal_id: explicit wins; else inherit from parent task. */
export function resolveTaskGoalId(input: {
  explicit_goal_id?: string | null;
  parent_goal_id?: string | null;
}): string | null {
  const explicit = input.explicit_goal_id?.trim();
  if (explicit) {
    return explicit;
  }
  const inherited = input.parent_goal_id?.trim();
  return inherited || null;
}

/** Agent-created tasks must carry goal context (human tasks may omit in v1). */
export function assertAgentTaskGoal(input: {
  actorKind: TaskTransitionActorKind | "agent_create";
  goal_id: string | null;
}): void {
  if (input.actorKind === "agent_create" && !input.goal_id) {
    throw new Error("agent_task_goal_required");
  }
}
