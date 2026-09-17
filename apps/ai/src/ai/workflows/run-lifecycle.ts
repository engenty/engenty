// Bookkeeping around a graph run: settle the audit row + run record once the
// workflow start/resume returns.
//
// A graph action is NOT wrapped in an outer job workflow. The stored graph is
// itself the durable Mastra workflow — it has its own pg snapshot, its own
// suspend/resume, its own crash-resume. Wrapping it would mean an outer step
// that has to mirror every inner suspension, which buys nothing and creates two
// places where a run's state can disagree. So the route starts the graph and
// this module records what happened.
import { createLogger } from "@engenty/telemetry";
import { jsonSchemaToZod } from "@mastra/core/workflows";
import type { SpaceGateContext } from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import { isUnresolvedSpaceGate } from "../../../ai/tools/engenty-tools/lib/space-gate.js";
import { emitInboxNotification } from "../../notifications/inbox.js";
import {
  notifyRunSuspended,
  resolveRunNotifications,
} from "../../notifications/run-notifications.js";
import {
  createArtifactStoreFromEnv,
  createRoutineStoreFromEnv,
  createWorkflowRunStoreFromEnv,
} from "../index.js";
import { finishActionRun } from "../jobs/action-job-run-record.js";
import { reportRoutineRun } from "../routines/report-routine-run.js";
import {
  holdRunForReview,
  routineHoldsForReview,
} from "../routines/review-hold.js";
import type { GraphRunOutcome } from "./dispatch.js";
import { forgetGraphRunScope } from "./run-context.js";
import { emitGraphRunTerminal } from "./run-events.js";
import { extractRunContractFields } from "./run-outcome.js";
import {
  type FlowSettleKind,
  mirrorFlowSettleToTask,
  resumeTaskAfterNestedFlow,
} from "./task-mirror.js";

const logger = createLogger({ name: "graph-action-lifecycle" });

export interface SettleGraphRunInput {
  /** The person who started the run, when one did — audience for its asks. */
  initiatorUserId?: string | null;
  /** True while invoke_workflow is still inside the owning Task's active run. */
  nestedInvocationActive?: boolean;
  outcome: GraphRunOutcome;
  /**
   * The pinned version's declared output schema. Non-empty means the flow
   * promised a shape; the result is checked against it at settle. Empty or
   * absent means the flow answers in prose, which stays legal.
   */
  outputSchema?: Record<string, unknown>;
  requestId: string;
  runId: string;
  /** The run's Space, when the caller has it resolved; null = tenant-global. */
  space?: SpaceGateContext | null;
  tenantId: string;
}

/** The space id a resolved gate context names; unresolved/global → null. */
export function settledSpaceId(
  space: SpaceGateContext | null | undefined
): string | null {
  if (!space || isUnresolvedSpaceGate(space)) {
    return null;
  }
  return space.spaceId;
}

/** Longest summary the desk card will show before it stops being a summary. */
const SUMMARY_MAX = 500;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The artifact a run's result points at, named for the report. A flow that
 * stored its work answers with the artifact's id under a key like
 * `artifact_link` — a bare uuid in a chat message tells the reader nothing,
 * so the settle resolves it to the artifact's title. Best-effort: an
 * unreadable artifact just leaves the report without the line.
 */
async function resolveResultArtifact(
  result: unknown,
  tenantId: string
): Promise<{ id: string; title: string } | null> {
  if (!(result && typeof result === "object")) {
    return null;
  }
  let artifactId: string | null = null;
  for (const key of ["artifact_link", "artifact_id", "artifact"]) {
    const value = (result as Record<string, unknown>)[key];
    if (typeof value === "string" && UUID_PATTERN.test(value.trim())) {
      artifactId = value.trim();
      break;
    }
  }
  if (!artifactId) {
    return null;
  }
  try {
    const store = createArtifactStoreFromEnv();
    const found = await store?.get({ artifactId, tenantId });
    return found ? { id: artifactId, title: found.artifact.title } : null;
  } catch {
    return null;
  }
}

/**
 * The one line a desk card shows for a finished run.
 *
 * A graph's last step answers in whatever shape it likes, so this takes the
 * prose if there is prose and gives up otherwise — an empty summary is honest,
 * a JSON blob pasted onto a card is not.
 */
function summarizeRunResult(result: unknown): string | null {
  if (typeof result === "string") {
    return result.trim().slice(0, SUMMARY_MAX) || null;
  }
  if (result && typeof result === "object") {
    for (const key of ["summary", "result", "text", "message"]) {
      const value = (result as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim().slice(0, SUMMARY_MAX);
      }
    }
  }
  return null;
}

/**
 * Record a graph run's outcome. Suspended and sleeping runs stay open — the
 * gate already marked the audit row `requires_action`; a sleeping run is parked
 * with its wake time so the inbox can show "wakes Thu 09:00" instead of a run
 * that looks stuck.
 */
export async function settleGraphRun(
  input: SettleGraphRunInput
): Promise<void> {
  const requests = createWorkflowRunStoreFromEnv();

  // Variant D: the run may be supervised by a Task. Read the owner ONCE here,
  // before any early return, so every settle path can mirror — a gate answered
  // tomorrow and a sleeper woken next week both come back through this
  // function, and both must be able to reach the board.
  const request = await requests
    ?.getByRunId({ runId: input.runId, tenantId: input.tenantId })
    .catch(() => null);
  const owner = request?.owner_task_id
    ? {
        mode: request.owner_task_mode ?? ("primary" as const),
        taskId: request.owner_task_id,
      }
    : null;

  const mirror = async (kind: FlowSettleKind, detail?: string | null) => {
    if (!owner) {
      return;
    }
    await mirrorFlowSettleToTask({
      kind,
      taskId: owner.taskId,
      tenantId: input.tenantId,
      ...(detail ? { detail } : {}),
    });
  };

  if (input.outcome.status === "suspended") {
    // The approval_gate primitive already set requires_action before
    // suspending. Nothing to finalize — the run resumes later. The ask itself
    // is announced here, the one place every graph lane's suspend lands: a
    // press, a routine fire and a canvas run all park through this branch.
    await mirror("gated", input.outcome.gate?.title ?? null);
    const gate = input.outcome.gate;
    const routine =
      request?.routine_id && !owner
        ? await createRoutineStoreFromEnv()
            ?.get({ id: request.routine_id, tenantId: input.tenantId })
            .catch(() => null)
        : null;
    await notifyRunSuspended({
      actorAgentId: request?.agent_id ?? null,
      ask: {
        kind: gate?.kind === "question" ? "action_question" : "action_gate",
        ...(gate?.payload ? { payload: gate.payload } : {}),
        title: gate?.title ?? "A workflow run is waiting for a decision",
      },
      initiatorUserId: input.initiatorUserId ?? null,
      metadata: {
        ...(request?.agent_id ? { agent_id: request.agent_id } : {}),
        ...(request?.workflow_id ? { workflow_id: request.workflow_id } : {}),
        ...(gate?.stepId ? { step_id: gate.stepId } : {}),
        ...(gate?.kind ? { gate_kind: gate.kind } : {}),
        ...(owner ? { task_id: owner.taskId } : {}),
        request_id: input.requestId,
        ...(request?.thread_id ? { thread_id: request.thread_id } : {}),
      },
      ownerUserId: routine?.created_by_user_id ?? null,
      routineId: request?.routine_id ?? null,
      runId: input.runId,
      source: "workflows",
      spaceId: settledSpaceId(input.space) ?? routine?.space_id ?? null,
      subject: { id: input.runId, type: "run" },
      tenantId: input.tenantId,
    });
    return;
  }

  if (input.outcome.status === "sleeping") {
    await requests
      ?.setStatus({
        id: input.requestId,
        status: "sleeping",
        tenantId: input.tenantId,
        ...(input.outcome.wakeAt ? { wakeAt: input.outcome.wakeAt } : {}),
      })
      .catch((err: unknown) => {
        logger.warn("graph run sleep bookkeeping failed", {
          error: err instanceof Error ? err.message : String(err),
          runId: input.runId,
        });
      });
    // No mirror: a sleeping run's task is resting on purpose. The wake sweep
    // resumes the graph and this function runs again at the real settle.
    return;
  }

  const status = input.outcome.status === "failed" ? "failed" : "completed";

  // The flow's own verdict, read off its declared output. Invalid values are
  // dropped, never thrown — a model misspelling "partial" must not turn a
  // completed run into a failed one.
  const contract = extractRunContractFields(input.outcome.result);
  if (contract.invalid) {
    logger.warn("graph run declared an invalid contract value", {
      invalid: contract.invalid,
      runId: input.runId,
    });
  }

  // A declared output schema is a promise about the result's shape. A broken
  // promise does not fail the run — the work happened — but it voids the
  // verdict (a shape the schema rejects cannot be trusted to carry one) and
  // says so in the reason, which is what the owner's report renders.
  let reason = input.outcome.reason ?? null;
  let outcome = contract.outcome;
  const schema = input.outputSchema;
  if (schema && Object.keys(schema).length > 0 && status === "completed") {
    const checked = jsonSchemaToZod(schema).safeParse(input.outcome.result);
    if (!checked.success) {
      const detail = checked.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      logger.warn("graph run output did not match its declared schema", {
        detail,
        runId: input.runId,
      });
      outcome = null;
      reason = [reason, `output did not match the declared schema: ${detail}`]
        .filter(Boolean)
        .join(" — ");
    }
  }

  // The routine behind a fire, read once: its report knob decides whether
  // this settle finishes the run or parks it for a look.
  const routines = request?.routine_id ? createRoutineStoreFromEnv() : null;
  const routine =
    routines && request?.routine_id
      ? await routines
          .get({ id: request.routine_id, tenantId: input.tenantId })
          .catch(() => null)
      : null;

  // `report: ask` — a completed fire is not done until its owner has looked.
  // The report goes out now (never silent), the run stays parked, and the
  // review route finishes what this branch leaves open. A task-owned run
  // has the task's own review; a crash is an alert, handled below.
  if (
    status === "completed" &&
    !owner &&
    request?.routine_id &&
    request.thread_id &&
    requests &&
    routines &&
    routine &&
    routineHoldsForReview(routine)
  ) {
    const summary = summarizeRunResult(input.outcome.result);
    const artifact = await resolveResultArtifact(
      input.outcome.result,
      input.tenantId
    );
    await holdRunForReview({
      initiatorUserId: input.initiatorUserId ?? null,
      outcome,
      reason,
      reporting: contract.reporting ?? null,
      request,
      requests,
      routine,
      runId: input.runId,
      spaceId: settledSpaceId(input.space),
      summary,
      tenantId: input.tenantId,
    });
    await reportRoutineRun({
      awaitingReview: true,
      summary,
      ...(artifact ? { artifact } : {}),
      ...(outcome ? { outcome } : {}),
      ...(contract.reporting ? { reporting: contract.reporting } : {}),
      routineId: request.routine_id,
      routines,
      runId: input.runId,
      status,
      ...(request.created_at ? { since: new Date(request.created_at) } : {}),
      tenantId: input.tenantId,
      threadId: request.thread_id,
      ...(reason ? { reason } : {}),
    });
    return;
  }

  try {
    await requests?.finish({
      id: input.requestId,
      outcome,
      reason,
      reporting: contract.reporting,
      status,
      // What the run achieved, for the desk card. A failure explains itself
      // through `reason`; this is the success half, and it stays absent rather
      // than being filled with a placeholder nobody wrote.
      summary: summarizeRunResult(input.outcome.result),
      tenantId: input.tenantId,
    });
  } catch (err) {
    logger.warn("graph run audit finalize failed", {
      error: err instanceof Error ? err.message : String(err),
      runId: input.runId,
    });
  }
  await finishActionRun({
    runId: input.runId,
    status,
    tenantId: input.tenantId,
  });
  // The run moved on: whatever asked on its behalf is answered or moot.
  await resolveRunNotifications({
    outcome: status,
    subject: { id: input.runId, type: "run" },
    tenantId: input.tenantId,
  });
  // The stream's last word — after the persisted status, so a consumer woken
  // by the terminal event reads the settled row. Suspends and sleeps returned
  // above: their stream stays open for the resume.
  if (request?.thread_id) {
    await emitGraphRunTerminal(
      {
        runId: input.runId,
        tenantId: input.tenantId,
        threadId: request.thread_id,
      },
      { reason, status }
    );
  }
  // A routine fire says what it did. Every settle path lands here — a run that
  // finished on the first pass, one resumed after an approval days later, one
  // woken from a sleep — so the report follows the work rather than the tick.
  if (status === "failed" && !owner) {
    // A press or a fire that broke with nobody supervising it: the failure is
    // an alert, coalesced per routine while unhandled (a crashing schedule
    // would otherwise raise one per interval).
    await emitInboxNotification({
      dedupeKey: request?.routine_id
        ? `routine_failed:${request.routine_id}`
        : `action_failed:${input.runId}`,
      initiatorUserId: input.initiatorUserId ?? null,
      kind: request?.routine_id ? "routine_failed" : "action_failed",
      metadata: {
        run_id: input.runId,
        ...(request?.routine_id ? { routine_id: request.routine_id } : {}),
        ...(request?.workflow_id ? { workflow_id: request.workflow_id } : {}),
        ...(request?.thread_id ? { thread_id: request.thread_id } : {}),
      },
      ownerUserId: routine?.created_by_user_id ?? null,
      payload: { error: (reason ?? "").slice(0, 1000) },
      priority: "high",
      source: "workflows",
      spaceId: settledSpaceId(input.space) ?? routine?.space_id ?? null,
      subject: request?.routine_id
        ? { id: request.routine_id, type: "routine" }
        : { id: input.runId, type: "run" },
      summary: routine?.name
        ? `Routine "${routine.name}" failed${reason ? `: ${reason.slice(0, 200)}` : ""}`
        : `Workflow run failed${reason ? `: ${reason.slice(0, 200)}` : ""}`,
      tenantId: input.tenantId,
    });
  }
  if (routines && request?.routine_id && request.thread_id) {
    const artifact = await resolveResultArtifact(
      input.outcome.result,
      input.tenantId
    );
    await reportRoutineRun({
      summary: summarizeRunResult(input.outcome.result),
      ...(artifact ? { artifact } : {}),
      ...(outcome ? { outcome } : {}),
      ...(contract.reporting ? { reporting: contract.reporting } : {}),
      routineId: request.routine_id,
      routines,
      runId: input.runId,
      status,
      // The dispatch stamp bounds the report to THIS fire's own words — the
      // one thing that stops a standing thread replaying yesterday's answer.
      ...(request.created_at ? { since: new Date(request.created_at) } : {}),
      tenantId: input.tenantId,
      threadId: request.thread_id,
      ...(reason ? { reason } : {}),
    });
  }
  if (owner?.mode === "nested") {
    if (status === "failed" || !input.nestedInvocationActive) {
      await resumeTaskAfterNestedFlow({
        failed: status === "failed",
        taskId: owner.taskId,
        tenantId: input.tenantId,
        ...(input.outcome.reason ? { detail: input.outcome.reason } : {}),
      });
    }
    forgetGraphRunScope({
      requestId: input.requestId,
      tenantId: input.tenantId,
    });
    return;
  }
  await mirror(status === "failed" ? "failed" : "completed", reason);
  forgetGraphRunScope({ requestId: input.requestId, tenantId: input.tenantId });
}
