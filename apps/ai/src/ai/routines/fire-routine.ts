// Fire a routine — the one path from "it is due" to "a run started".
//
// Shared by the schedule tick, the event subscriber, the webhook edge and
// run-now, so the four cannot drift apart the way trigger fires and button
// presses did. What comes out is a RUN, in the same family a button press
// produces: same dispatcher, same run index, same version pinning.
//
// What it is NOT: a task. A routine that has never produced a work item is
// working correctly. See docs/content/dev/work-model.md.
import { createLogger } from "@engenty/telemetry";
import type { SpaceGateContext } from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import type {
  RoutineRow,
  RoutineStore,
} from "../../dal/routines/routine-store.js";
import type { WorkflowRunStore } from "../../dal/workflow-runs/workflow-run-store.js";
import type { WorkflowStore } from "../../dal/workflows/workflow-store.js";
import { isWithinQuietHours } from "../../scheduler/quiet-hours.js";
import { createThreadStoreFromEnv } from "../index.js";
import { resolveTaskJobServiceScope } from "../jobs/task-job-scope.js";
import {
  resolveRunSpaceById,
  toolsSpaceFromResolution,
} from "../sessions/run-space.js";
import type { AiSessionScope } from "../sessions/types.js";
import {
  dispatchPublishedWorkflowRun,
  stableUuid,
} from "../workflows/dispatch-published-run.js";
import { resolveRoutineOwnerThread } from "./report-routine-run.js";

const logger = createLogger({ name: "fire-routine" });

/** Why a fire produced no run. Every one of these is normal, not an error. */
export type RoutineSkipReason = "disabled" | "overlap" | "quiet_hours";

/**
 * The one thread a routine's fires share — its log.
 *
 * Each fire used to mint a thread of its own, which is right for a press and
 * wrong for a schedule: a ten-minute routine produced ~144 identically titled
 * rooms a day, every one of them a separate desk engagement, and no fire could
 * see what the last one had said. Derived from the routine id so it is the
 * same room on every tick without anything having to be stored.
 *
 * The per-fire record does not live here — that is `ai.agent_run`, one row per
 * fire, which the Runs tab reads. This is the transcript.
 */
export function routineThreadId(routineId: string): string {
  return stableUuid(`routine-thread:${routineId}`);
}

export interface FireRoutineResult {
  /** The run that started, when one did. */
  requestId?: string;
  routineId: string;
  runId?: string;
  skipped?: RoutineSkipReason;
  threadId?: string;
}

export interface FireRoutineInput {
  /**
   * The conversation that asked for this fire ("run it now"), when one did.
   * Its result comes back there as well as to the routine's own chat.
   */
  callerThreadId?: string | null;
  /** Extra input for this occurrence — an event payload, mapped. */
  eventInput?: Record<string, unknown>;
  flowGraphs: WorkflowStore;
  /**
   * A scheduled tick honours quiet hours; run-now deliberately does not — the
   * person asking is present, and quiet hours protect against unattended
   * noise, not against being used.
   */
  honorQuietHours: boolean;
  now?: Date;
  requests: WorkflowRunStore;
  routine: RoutineRow;
  routines: RoutineStore;
  /** How this fire started, in the run index's vocabulary. */
  trigger: "cron" | "direct" | "hook";
}

/**
 * The scope a routine fire runs as, and the Space it may reach.
 *
 * Two principals, deliberately: the fire EXECUTES as the AI service (nobody is
 * at the keyboard, and it needs a credential to talk to core at all), but it
 * RESOLVES its Space surface as the human who configured the routine. Without
 * the second half a routine in a private Space has every module tool refused
 * with `space_context_unresolved` — the run "succeeds" having read nothing,
 * which is the worst possible failure because it looks like success.
 */
async function principalForRoutine(routine: RoutineRow): Promise<{
  scope: AiSessionScope;
  space: SpaceGateContext | null;
}> {
  const scope = await resolveTaskJobServiceScope(routine.tenant_id);
  if (!routine.space_id) {
    // Tenant-global by intention, not by failure — never widened from an
    // unresolved claim.
    return { scope, space: null };
  }
  const resolution = await resolveRunSpaceById({
    // Names the routine, not the Space: core looks the Space up from the
    // routine row itself, so this unlocks a PRIVATE Space's surface for the
    // job that belongs to it and nothing else.
    routineId: routine.id,
    scope,
    spaceId: routine.space_id,
    ...(routine.created_by_user_id
      ? { actingUserId: routine.created_by_user_id }
      : {}),
  });
  return { scope, space: toolsSpaceFromResolution(resolution) };
}

export async function fireRoutine(
  input: FireRoutineInput
): Promise<FireRoutineResult> {
  const { flowGraphs, requests, routine, routines } = input;
  const now = input.now ?? new Date();

  if (!routine.enabled) {
    // Reconcile pauses a disabled routine's schedule; this covers the gap
    // between the write and the next reconcile.
    return { routineId: routine.id, skipped: "disabled" };
  }

  if (
    input.honorQuietHours &&
    routine.quiet_hours &&
    isWithinQuietHours(routine.quiet_hours, now)
  ) {
    logger.info("routine fire suppressed by quiet hours", {
      routineId: routine.id,
    });
    return { routineId: routine.id, skipped: "quiet_hours" };
  }

  // Overlap lives on the run, not on a work item's checkout column: a routine
  // whose previous run is still going (or still waiting on a person) skips
  // this tick rather than running twice over the same ground.
  const active = await requests.findActiveByRoutine({
    routineId: routine.id,
    tenantId: routine.tenant_id,
  });
  if (active) {
    logger.info("routine fire skipped — previous run still active", {
      activeRunId: active.run_id,
      routineId: routine.id,
    });
    await routines.recordFire({
      firedAt: now.toISOString(),
      id: routine.id,
      result: "skipped — previous run still active",
      tenantId: routine.tenant_id,
    });
    return { routineId: routine.id, skipped: "overlap" };
  }

  // A binding names a workflow; the fire references its published version or
  // refuses. Nothing is materialized here — module workflows exist from
  // reconcile, custom ones from their save.
  const current = await flowGraphs.getCurrent({
    id: routine.workflow_id,
    tenantId: routine.tenant_id,
  });
  if (!current) {
    const message = `workflow ${routine.workflow_id} has no published version`;
    await routines.recordFire({
      firedAt: now.toISOString(),
      id: routine.id,
      result: `failed — ${message}`,
      tenantId: routine.tenant_id,
    });
    throw new Error(`routine ${routine.id}: ${message}`);
  }

  const { scope, space } = await principalForRoutine(routine);
  const dispatched = await dispatchPublishedWorkflowRun({
    workflowId: current.graph.id,
    // A routine's runs are grouped by the routine, not by a subject: there is
    // no contact or invoice a nightly scan is "about". Per-subject dedup is
    // therefore inert here and the overlap guard above does the work.
    context: { contextId: null, contextType: null },
    current,
    // The run belongs on its specialist's desk, under the routine's own name —
    // the run itself stays attributed to the compiled action, which is what
    // pins its version.
    deskAgentId: routine.agent_id,
    ...(input.callerThreadId ? { callerThreadId: input.callerThreadId } : {}),
    input: { ...(routine.workflow_input ?? {}), ...(input.eventInput ?? {}) },
    routineId: routine.id,
    routineTitle: routine.name,
    // The standing allow-list a person set when they wrote the routine. It is
    // the only approval moment a schedule gets: at 03:00 there is nobody to
    // ask, so a fire either may do the work or does nothing.
    ...(routine.approval_grants.length > 0
      ? { approvalGrants: routine.approval_grants }
      : {}),
    scope,
    space,
    // The routine's own Space, not whatever the caller happened to be in: a
    // scheduled fire has no caller at all.
    spaceId: routine.space_id,
    // One log per routine, not one room per tick.
    threadId: routineThreadId(routine.id),
    trigger: input.trigger,
  });

  await routines.recordFire({
    firedAt: now.toISOString(),
    id: routine.id,
    result: dispatched.deduped ? "deduped — run already in flight" : "started",
    tenantId: routine.tenant_id,
  });
  // The chat's account of the run begins HERE, not at settle: a message the
  // settle report later closes, so the story survives a reload where the SSE
  // card does not. Quiet routines start quietly; a failure still reports at
  // settle regardless (resolveReportingLevel's floor).
  if (!dispatched.deduped && routine.report !== "quiet") {
    await postRoutineStartedMessage({ routine, runId: dispatched.runId });
  }
  logger.info("routine fired", {
    routineId: routine.id,
    runId: dispatched.runId,
  });

  return {
    requestId: dispatched.requestId,
    routineId: routine.id,
    runId: dispatched.runId,
    threadId: dispatched.threadId,
  };
}

/**
 * "▸ started" in the owner's chat, best-effort and idempotent on the run id —
 * a replayed dispatch upserts the same message rather than posting twice, and
 * a posting failure must not fail the fire it narrates.
 */
async function postRoutineStartedMessage(input: {
  routine: RoutineRow;
  runId: string;
}): Promise<void> {
  try {
    const store = createThreadStoreFromEnv();
    if (!store) {
      return;
    }
    const destination = await resolveRoutineOwnerThread({
      routine: input.routine,
      store,
    });
    if (!destination) {
      return;
    }
    await store.appendMessage({
      authorUserId: null,
      id: stableUuid(`routine-start:${input.runId}`),
      metadata: {
        // Worded by the chat in the reader's language.
        engenty_routine_notice: { kind: "started", name: input.routine.name },
        routine_id: input.routine.id,
        run_id: input.runId,
        source: "routine-report",
      },
      parts: [
        { text: `▸ **Routine · ${input.routine.name}** started`, type: "text" },
      ],
      role: "assistant",
      tenantId: input.routine.tenant_id,
      threadId: destination,
    });
  } catch (err) {
    logger.warn("routine started-message failed", {
      error: err instanceof Error ? err.message : String(err),
      routineId: input.routine.id,
    });
  }
}
