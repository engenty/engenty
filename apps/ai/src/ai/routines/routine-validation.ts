// Write-path guards for routines.
//
// These run on every routine write — HTTP and tool alike — because a routine
// that looks configured but can never fire is worse than a rejected write. The
// scheduler only reports such a routine at the moment it silently does nothing.
import {
  canAgentOwnTrigger,
  type RoutineSource,
  type TriggerOwnerAgent,
} from "@engenty/plugin-sdk";
import { Cron } from "croner";
import type { RoutineRow } from "../../dal/routines/routine-store.js";

export class RoutineValidationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.name = "RoutineValidationError";
    this.status = status;
  }
}

/**
 * Reject a cron/timezone pair that cannot back a firing schedule.
 *
 * Croner is the same parser Mastra schedules run on, so what passes here is
 * exactly what the scheduler will accept. Croner does NOT validate the
 * timezone — it silently accepts junk — so the IANA name is checked separately
 * via Intl. Constructing a Cron without a callback only parses the pattern; no
 * timer is ever scheduled.
 */
export function assertValidSchedule(
  cron: string,
  timezone: string | null | undefined
): void {
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw new RoutineValidationError(
        "routines.invalidTimezone",
        `not an IANA timezone: ${timezone}`
      );
    }
  }
  try {
    new Cron(cron, timezone ? { timezone } : {});
  } catch {
    throw new RoutineValidationError(
      "routines.invalidCron",
      `not a valid cron expression: ${cron}`
    );
  }
}

/**
 * Only a specialist may own a routine created at runtime.
 *
 * The copilot is the interface and the coordinator is the dispatcher; neither
 * is a worker, and a routine parked on one leaves nobody in the Space visibly
 * owning the job. Module-declared housekeeping (trigger declarations, reviewed
 * code) clears a lower bar — it only has to not be a chat surface or a
 * delegated sub-agent. The caller resolves the agent in the registry and
 * hands the object in; an unresolved agent must be refused BEFORE this check.
 */
export function assertRoutineEligibleAgent(
  agent: TriggerOwnerAgent,
  source: RoutineSource = "custom"
): void {
  if (canAgentOwnTrigger(agent, source)) {
    return;
  }
  throw new RoutineValidationError(
    "routines.agentCannotOwn",
    `'${agent.id}' cannot own a routine. Every routine is owned by a specialist that exists to do that job. Use a specialist already mounted in this Space, or create one for it with agent_propose.`
  );
}

/** The wake-source fields a duplicate check compares — a trigger subset. */
export interface WakeSourceFingerprint {
  cron?: string | null;
  kind: string;
  provider_id?: string | null;
  resource?: string | null;
  timezone?: string | null;
}

/** Same wake source — the fingerprint half a duplicate shares. */
function sameWakeSource(
  a: WakeSourceFingerprint,
  b: WakeSourceFingerprint
): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "schedule") {
    return (
      (a.cron ?? "").trim() === (b.cron ?? "").trim() &&
      (a.timezone ?? "") === (b.timezone ?? "")
    );
  }
  if (a.kind === "event") {
    return a.provider_id === b.provider_id && a.resource === b.resource;
  }
  // Manual and agent triggers are deliberately exempt: they have no clock,
  // and several routines a person or the agent can press are a normal setup.
  return false;
}

function sameTarget(a: RoutineRow, b: RoutineRow): boolean {
  return a.workflow_id === b.workflow_id && a.agent_id === b.agent_id;
}

/** A routine with the triggers that wake it — what the duplicate check reads. */
export interface RoutineWithTriggers {
  routine: RoutineRow;
  triggers: WakeSourceFingerprint[];
}

/**
 * The routine an incoming create would duplicate, if any.
 *
 * Names are NOT compared — the real incident (two 07:00 contact imports
 * created eleven seconds apart) had different names and identical behaviour.
 * What makes a duplicate is waking at the same moment to run the same worker:
 * any schedule/event trigger of the candidate matching any trigger of a
 * routine with the same worker.
 */
export function findDuplicateRoutine(
  existing: RoutineWithTriggers[],
  candidate: RoutineWithTriggers
): RoutineRow | null {
  return (
    existing.find(
      (entry) =>
        entry.routine.id !== candidate.routine.id &&
        sameTarget(entry.routine, candidate.routine) &&
        entry.triggers.some((theirs) =>
          candidate.triggers.some((ours) => sameWakeSource(theirs, ours))
        )
    )?.routine ?? null
  );
}
