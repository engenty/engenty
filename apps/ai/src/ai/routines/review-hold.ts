// A fire that must be looked at before it counts as done.
//
// `report: ask` promised "every run comes back to you before it counts as
// done" and nothing kept it: the run finished like any other and the promise
// lived in a form hint. The hold is enforced at settle, next to the quiet /
// desk_card knobs. A completed fire keeps its result, but its run stays
// `requires_action` — the same parked state a gate uses — so the desk shows
// it waiting, the inbox carries ONE decision, and the overlap guard skips the
// next tick until someone has looked. Reviewing releases it: the run
// finishes, the record closes, the stream ends.
//
// Only a run that completed is held. A crash is an alert, not a review; and a
// task-supervised run has the task's own review lane.
import { createLogger } from "@engenty/telemetry";
import type { RoutineRow } from "../../dal/routines/routine-store.js";
import type {
  WorkflowRunRow,
  WorkflowRunStore,
} from "../../dal/workflow-runs/workflow-run-store.js";
import {
  notifyRunSuspended,
  resolveRunNotifications,
} from "../../notifications/run-notifications.js";
import { createThreadStoreFromEnv } from "../index.js";
import { finishActionRun } from "../jobs/action-job-run-record.js";
import { stableUuid } from "../workflows/dispatch-published-run.js";
import { forgetGraphRunScope } from "../workflows/run-context.js";
import { emitGraphRunTerminal } from "../workflows/run-events.js";
import { resolveRoutineOwnerThread } from "./report-routine-run.js";

const logger = createLogger({ name: "routine-review-hold" });

/** The routine's knob says every run waits for a person. */
export function routineHoldsForReview(
  routine: Pick<RoutineRow, "report"> | null | undefined
): boolean {
  return routine?.report === "ask";
}

export interface HoldRunForReviewInput {
  initiatorUserId?: string | null;
  /** The flow's verdict, when it declared one — kept on the row now. */
  outcome?: string | null;
  reason?: string | null;
  reporting?: string | null;
  request: Pick<
    WorkflowRunRow,
    "agent_id" | "id" | "thread_id" | "workflow_id"
  >;
  requests: Pick<WorkflowRunStore, "finish">;
  routine: RoutineRow;
  runId: string;
  spaceId?: string | null;
  summary?: string | null;
  tenantId: string;
}

/**
 * Park a completed fire until its owner has looked. Result columns are
 * written now — the review reads them — and only the status waits.
 */
export async function holdRunForReview(
  input: HoldRunForReviewInput
): Promise<void> {
  try {
    await input.requests.finish({
      id: input.request.id,
      outcome: input.outcome ?? null,
      reason: input.reason ?? null,
      reporting: input.reporting ?? null,
      status: "requires_action",
      summary: input.summary ?? null,
      tenantId: input.tenantId,
    });
  } catch (err) {
    logger.warn("review hold bookkeeping failed", {
      error: err instanceof Error ? err.message : String(err),
      runId: input.runId,
    });
  }
  await finishActionRun({
    runId: input.runId,
    status: "requires_action",
    tenantId: input.tenantId,
  });
  await notifyRunSuspended({
    actorAgentId: input.routine.agent_id,
    ask: {
      // The result's first line under the title; the whole result is on the
      // run page the row opens.
      ...(input.summary ? { body: input.summary } : {}),
      kind: "routine_review",
      ...(input.summary ? { payload: { summary: input.summary } } : {}),
      priority: "medium",
      summary: "A routine finished — review the result",
      ...(input.routine.name?.trim()
        ? {
            title: {
              key: "routine_review",
              params: { name: input.routine.name.trim() },
            },
          }
        : {}),
    },
    initiatorUserId: input.initiatorUserId ?? null,
    metadata: {
      ...(input.request.agent_id ? { agent_id: input.request.agent_id } : {}),
      ...(input.request.workflow_id
        ? { workflow_id: input.request.workflow_id }
        : {}),
      request_id: input.request.id,
      ...(input.request.thread_id
        ? { thread_id: input.request.thread_id }
        : {}),
    },
    ownerUserId: input.routine.created_by_user_id,
    routineId: input.routine.id,
    runId: input.runId,
    source: "workflows",
    spaceId: input.spaceId ?? input.routine.space_id ?? null,
    subject: { id: input.runId, type: "run" },
    tenantId: input.tenantId,
  });
  // The graph is done; nothing will resume inside it.
  forgetGraphRunScope({
    requestId: input.request.id,
    tenantId: input.tenantId,
  });
}

export interface ReleaseReviewedRunInput {
  request: Pick<WorkflowRunRow, "id" | "status" | "thread_id">;
  requests: Pick<WorkflowRunStore, "finish">;
  /** The routine, for the closing line in its owner's chat; null skips it. */
  routine: RoutineRow | null;
  runId: string;
  tenantId: string;
}

export type ReleaseReviewedRunResult = "released" | "not_held";

/**
 * The owner looked: finish the run the way settle would have. Idempotent — a
 * run that is not parked answers `not_held` and nothing is rewritten.
 */
export async function releaseReviewedRun(
  input: ReleaseReviewedRunInput
): Promise<ReleaseReviewedRunResult> {
  if (input.request.status !== "requires_action") {
    return "not_held";
  }
  await input.requests.finish({
    id: input.request.id,
    status: "completed",
    tenantId: input.tenantId,
  });
  await finishActionRun({
    runId: input.runId,
    status: "completed",
    tenantId: input.tenantId,
  });
  await resolveRunNotifications({
    outcome: "decided",
    subject: { id: input.runId, type: "run" },
    tenantId: input.tenantId,
  });
  if (input.request.thread_id) {
    await emitGraphRunTerminal(
      {
        runId: input.runId,
        tenantId: input.tenantId,
        threadId: input.request.thread_id,
      },
      { status: "completed" }
    );
  }
  // Close the story in the chat where the "waiting for your review" line
  // sits — without this the report reads as still waiting. Best-effort.
  const store = createThreadStoreFromEnv();
  if (input.routine && store) {
    try {
      const destination = await resolveRoutineOwnerThread({
        routine: input.routine,
        store,
      });
      if (destination) {
        await store.appendMessage({
          authorUserId: null,
          id: stableUuid(`routine-review:${input.runId}`),
          metadata: {
            routine_id: input.routine.id,
            run_id: input.runId,
            source: "routine-report",
          },
          parts: [
            {
              text: `✓ **Routine · ${input.routine.name}** reviewed`,
              type: "text",
            },
          ],
          role: "assistant",
          tenantId: input.tenantId,
          threadId: destination,
        });
      }
    } catch (err) {
      logger.warn("routine reviewed-message failed", {
        error: err instanceof Error ? err.message : String(err),
        runId: input.runId,
      });
    }
  }
  return "released";
}
