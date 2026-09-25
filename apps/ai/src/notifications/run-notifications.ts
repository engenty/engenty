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
import type {
  NotificationPriority,
  NotificationTitle,
} from "@engenty/notifications";
import { emitInboxNotification, resolveNotifications } from "./inbox.js";

export interface RunAsk {
  /** One plain line under the title: the gate's question, the proposal. */
  body?: string | null;
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
  /**
   * English fallback, said whole — used only when the title misses a name.
   * Never ids.
   */
  summary: string;
  /** What the row says: a key of NOTIFICATION_TITLES + the names it uses. */
  title?: NotificationTitle;
}

export interface NotifyRunSuspendedInput {
  /** The registry id of the Engenty whose run parked — the row's actor. */
  actorAgentId?: string | null;
  /**
   * Its display name, when the caller has it; the list shows this. Absent,
   * origin enrichment resolves the agent id to its name.
   */
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
      // A known name is stamped; otherwise origin enrichment resolves the
      // actor id (never the raw id as a label).
      ...(input.actorAgentId && input.actorLabel?.trim()
        ? {
            actor_label: input.actorLabel.trim(),
            actor_ref: `agent:${input.actorAgentId}`,
          }
        : {}),
      ...input.metadata,
    },
    ownerUserId: input.ownerUserId ?? null,
    ...(input.participantUserIds?.length
      ? { participantUserIds: input.participantUserIds }
      : {}),
    ...(input.ask.body ? { body: input.ask.body } : {}),
    ...(input.ask.payload ? { payload: input.ask.payload } : {}),
    ...(input.preSeenUserIds?.length
      ? { preSeenUserIds: input.preSeenUserIds }
      : {}),
    priority: input.ask.priority ?? "high",
    source: input.source,
    spaceId: input.spaceId ?? null,
    subject: input.subject,
    summary: input.ask.summary,
    tenantId: input.tenantId,
    ...(input.ask.title ? { title: input.ask.title } : {}),
  });
}

/**
 * A failure as one plain line for a notification body: a known class
 * ("Connection expired", "Timed out") or the first line of the message —
 * never a stack, never the whole payload.
 */
export function failureLine(error: unknown): string | null {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const lower = text.toLowerCase();
  if (
    /invalid_grant|token (has )?expired|expired token|reauth|re-auth|reconnect|refresh token|connection (has )?expired|unauthori[sz]ed|\b401\b/.test(
      lower
    )
  ) {
    return "Connection expired";
  }
  if (/timed? ?out|timeout|etimedout|deadline exceeded/.test(lower)) {
    return "Timed out";
  }
  if (/rate.?limit|too many requests|\b429\b/.test(lower)) {
    return "Rate limited";
  }
  if (
    /econnrefused|enotfound|econnreset|network error|fetch failed/.test(lower)
  ) {
    return "Could not reach the service";
  }
  const first =
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !/^at\s/.test(line)) ?? "";
  // "Error: foo" → "foo"; the class name says nothing to a person.
  return first.replace(/^[A-Za-z]*Error:\s*/, "").slice(0, 200) || null;
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
