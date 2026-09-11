// The expiry sweep: decision records whose subject is over close themselves.
// Subjects: core approval requests, ai runs, desk thread interrupts.
//
// Every seam that settles a subject resolves its records (`resolve` by
// subject), but not every ending goes through a seam: an approval request
// runs out its TTL with nobody deciding, a run is failed by the restart
// reconciler, a process dies between the gate and the settle. Left alone
// those rows count on the bell forever. The sweep reads the subject's own
// state and resolves what it says is over — the backstop, never the primary
// path.
import type {
  NotificationRecord,
  NotificationResolveOutcome,
} from "./contracts.js";
import type { NotificationsStore } from "./dal/store.js";
import type { NotificationsService } from "./service.js";

export interface ApprovalRequestState {
  expires_at: string;
  status: "pending" | "approved" | "denied" | "expired" | string;
}

export interface RunState {
  status: string;
}

/** How the sweep reads subjects — injected so the package stays schema-free. */
export interface SweepSubjectStates {
  approvalRequests(ids: string[]): Promise<Map<string, ApprovalRequestState>>;
  runs(ids: string[]): Promise<Map<string, RunState>>;
  /** Of these desk interrupt ids, the ones a thread still holds open. */
  threadInterrupts(ids: string[]): Promise<Set<string>>;
}

/** Run states in which the gate is still open and the record must stay. */
const RUN_OPEN_STATES = new Set(["requires_action", "suspended", "sleeping"]);

export function approvalOutcome(
  state: ApprovalRequestState | undefined,
  now: Date
): NotificationResolveOutcome | null {
  if (!state) {
    return "expired"; // the request row is gone
  }
  if (state.status === "approved" || state.status === "denied") {
    return "decided";
  }
  if (state.status === "expired") {
    return "expired";
  }
  const expiresAt = Date.parse(state.expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime()
    ? "expired"
    : null;
}

export function runOutcome(
  state: RunState | undefined
): NotificationResolveOutcome | null {
  if (!state) {
    return "expired";
  }
  if (RUN_OPEN_STATES.has(state.status)) {
    return null;
  }
  if (state.status === "running") {
    return "resumed";
  }
  if (state.status === "completed") {
    return "completed";
  }
  // failed / cancelled / executor_lost: nobody will answer this any more.
  return "expired";
}

/**
 * A desk interrupt the thread no longer carries was answered (its resume
 * resolved the record) or closed without an answer between the clear and
 * the resolve; either way nobody can answer it any more.
 */
export function interruptOutcome(
  open: boolean
): NotificationResolveOutcome | null {
  return open ? null : "abandoned";
}

function groupBySubject(
  records: NotificationRecord[]
): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  for (const record of records) {
    if (!(record.subject_type && record.subject_id)) {
      continue;
    }
    const ids = groups.get(record.subject_type) ?? new Set<string>();
    ids.add(record.subject_id);
    groups.set(record.subject_type, ids);
  }
  return groups;
}

export async function sweepStaleDecisions(input: {
  limit?: number;
  now?: Date;
  service: Pick<NotificationsService, "resolve">;
  states: SweepSubjectStates;
  store: Pick<NotificationsStore, "listOpenWithSubject">;
  tenantId: string;
}): Promise<{ resolved: number; scanned: number }> {
  const now = input.now ?? new Date();
  const open = await input.store.listOpenWithSubject({
    class: "decision",
    limit: input.limit ?? 500,
    tenantId: input.tenantId,
  });
  const groups = groupBySubject(open);
  const outcomes = new Map<string, NotificationResolveOutcome>();

  const approvalIds = [...(groups.get("approval_request") ?? [])];
  if (approvalIds.length > 0) {
    const states = await input.states.approvalRequests(approvalIds);
    for (const id of approvalIds) {
      const outcome = approvalOutcome(states.get(id), now);
      if (outcome) {
        outcomes.set(`approval_request:${id}`, outcome);
      }
    }
  }
  const runIds = [...(groups.get("run") ?? [])];
  if (runIds.length > 0) {
    const states = await input.states.runs(runIds);
    for (const id of runIds) {
      const outcome = runOutcome(states.get(id));
      if (outcome) {
        outcomes.set(`run:${id}`, outcome);
      }
    }
  }
  const interruptIds = [...(groups.get("thread_interrupt") ?? [])];
  if (interruptIds.length > 0) {
    const open = await input.states.threadInterrupts(interruptIds);
    for (const id of interruptIds) {
      const outcome = interruptOutcome(open.has(id));
      if (outcome) {
        outcomes.set(`thread_interrupt:${id}`, outcome);
      }
    }
  }
  // Task subjects have their own re-dispatch lifecycle and are not swept.

  let resolved = 0;
  for (const [key, outcome] of outcomes) {
    const [subjectType, subjectId] = key.split(/:(.*)/s) as [string, string];
    resolved += await input.service.resolve({
      outcome,
      subjectId,
      subjectType,
      tenantId: input.tenantId,
    });
  }
  return { resolved, scanned: open.length };
}
