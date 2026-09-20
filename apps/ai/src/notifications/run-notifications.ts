// The two seams every run lane shares.
//
// A notification about a suspended run is a projection of run state, not an
// event of its own: it is written where the run parks (`notifyRunSuspended`)
// and resolved where the run moves on (`resolveRunNotifications`). Every lane
// — graph gate, delegate suspend, task job — calls these two instead of
// remembering to emit in one place and dismiss in another.
//
// A run in a space is addressed to the space: every member sees it and the
// first to answer wins. The presser and the routine's owner stay subscribed
// to the push; they no longer own the row.
import type { NotificationPriority } from "@engenty/notifications";
import { emitInboxNotification, resolveNotifications } from "./inbox.js";

export interface RunAsk {
  kind:
    | "action_gate"
    | "action_question"
    | "agent_run_suspended"
    | "tool_approval"
    | "task_question"
    | "task_needs_input"
    /** A finished routine run held until its owner has looked (`report: ask`). */
    | "routine_review";
  payload?: Record<string, unknown>;
  priority?: NotificationPriority;
  title: string;
}

export interface NotifyRunSuspendedInput {
  /** The registry id of the Engenty whose run parked — the row's actor. */
  actorAgentId?: string | null;
  /** Its display name, when the caller has it; the list shows this. */
  actorLabel?: string | null;
  ask: RunAsk;
  assigneeUserId?: string | null;
  /** Whoever pressed: subscribed to the push, never the audience of a space's run. */
  initiatorUserId?: string | null;
  metadata?: Record<string, unknown>;
  /** The routine's owner: subscribed, like the initiator. */
  ownerUserId?: string | null;
  /** A private subject's people, one row each — wins over the space. */
  participantUserIds?: readonly string[] | null;
  /** People already looking at the card: their view starts seen. */
  preSeenUserIds?: readonly string[] | null;
  routineId?: string | null;
  runId: string;
  source: "workflows" | "agents" | "tasks";
  spaceId?: string | null;
  /** What resolves it: the run itself (graph gates) or its task (task lanes). */
  subject: { id: string; type: "run" | "task" };
  tenantId: string;
}

/** Write the decision record for a parked run. Never throws. */
export async function notifyRunSuspended(
  input: NotifyRunSuspendedInput
): Promise<void> {
  await emitInboxNotification({
    actor: { id: input.actorAgentId ?? null, kind: "agent" },
    assigneeUserId: input.assigneeUserId ?? null,
    dedupeKey: `run:${input.runId}:${input.ask.kind}`,
    initiatorUserId: input.initiatorUserId ?? null,
    kind: input.ask.kind,
    metadata: {
      run_id: input.runId,
      ...(input.routineId ? { routine_id: input.routineId } : {}),
      ...(input.actorAgentId
        ? {
            actor_label: input.actorLabel ?? input.actorAgentId,
            actor_ref: `agent:${input.actorAgentId}`,
          }
        : {}),
      ...input.metadata,
    },
    ownerUserId: input.ownerUserId ?? null,
    ...(input.participantUserIds?.length
      ? { participantUserIds: input.participantUserIds }
      : {}),
    ...(input.ask.payload ? { payload: input.ask.payload } : {}),
    ...(input.preSeenUserIds?.length
      ? { preSeenUserIds: input.preSeenUserIds }
      : {}),
    priority: input.ask.priority ?? "high",
    source: input.source,
    spaceId: input.spaceId ?? null,
    subject: input.subject,
    summary: input.ask.title,
    tenantId: input.tenantId,
  });
}

/**
 * The run (or the task it worked) moved on: resolve every open record about
 * it. `completed` also closes earlier alerts about the same subject — a retry
 * that succeeded. Never throws.
 */
export async function resolveRunNotifications(input: {
  outcome: "resumed" | "completed" | "failed" | "decided" | "abandoned";
  subject: { id: string; type: "run" | "task" };
  tenantId: string;
}): Promise<number> {
  return resolveNotifications({
    outcome: input.outcome,
    subjectId: input.subject.id,
    subjectType: input.subject.type,
    tenantId: input.tenantId,
  });
}
