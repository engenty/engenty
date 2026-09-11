/** Canonical task status ids — aligned with projects task-status-builtins (lift in Phase 1). */
export const TASK_TERMINAL_STATUSES = new Set(["done", "cancelled"]);

/**
 * The single source of truth for "an agent may run this task": both the dispatch
 * gate (`isDispatchableTask`) and the DAL's `checkoutTask` read this set, so the
 * queue can never admit a task checkout would reject.
 */
export const TASK_AGENT_CHECKOUT_ENTRY_STATUSES = new Set(["todo", "backlog"]);

/**
 * Statuses a task may be CREATED into and still start on its own.
 *
 * Deliberately narrower than the checkout set. `backlog` stays
 * checkout-eligible because an existing task may be re-dispatched from there —
 * but a task someone creates INTO backlog means "not yet", and starting it
 * anyway makes "plan only" a lie. The two calls express different intent, so
 * they read different sets.
 */
export const TASK_CREATE_AUTOSTART_STATUSES = new Set(["todo"]);

/** Would creating a task in this status start it immediately? */
export function startsOnCreate(status: string): boolean {
  return TASK_CREATE_AUTOSTART_STATUSES.has(status);
}

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

/**
 * Primary assignee is singular; collaborators are additive.
 *
 * A task is assigned to a person, to a specialist, or to nobody. Assigning it
 * to a specialist is what makes it dispatchable — the kind `isDispatchableTask`
 * and the DAL's checkout guard key on.
 */
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
