// The wake sweep: put durable timers back together with parked runs.
//
// A `wait_until` node suspends the run and writes `workflow_run.wake_at`.
// Those are the two durable halves of a long wait — the Mastra snapshot holds
// WHERE the run is, the `wake_at` column holds WHEN it should continue — and
// nothing in either half depends on a process staying alive. This module is the
// thing that rejoins them: find runs whose time has come, resume them onto the
// version they were pinned to, and settle whatever happens next.
//
// It is deliberately a plain function over (db-backed stores, tenantId) rather
// than a timer of its own. The `graph-wake` system job owns the cadence, which
// means the wake sweep inherits the scheduler's multi-instance behaviour, its
// per-tenant fan-out and its run history for free. The only concurrency rule
// this module enforces itself is the claim — see `claimDueSleepers`.
//
// Boot is not a special case. A process that has been down for a week simply
// finds a larger backlog on its first tick, because "due" is a fact in the
// database, not a timer that was lost.
import { createLogger } from "@engenty/telemetry";
import type { WorkflowRunStore } from "../../dal/workflow-runs/workflow-run-store.js";
import type { WorkflowStore } from "../../dal/workflows/index.js";
import { resumeGraphRun } from "./dispatch.js";
import { settleGraphRun } from "./run-lifecycle.js";

const logger = createLogger({ name: "graph-action-wake-sweep" });

/** Runs woken per tick. Enough to clear a real backlog, bounded so one tenant can't hog a tick. */
const DEFAULT_LIMIT = 25;

export interface WakeSweepResult {
  /** Runs whose timer was due and which this instance won the claim for. */
  claimed: number;
  /** Claimed runs that threw while resuming. */
  failed: number;
  /** Claimed runs that resumed and settled. */
  resumed: number;
}

export interface SweepDueGraphWaitsInput {
  graphs: WorkflowStore;
  limit?: number;
  /** Wake times at or before this are due. Injected by tests; defaults to now. */
  now?: string;
  requests: WorkflowRunStore;
  tenantId: string;
}

/**
 * Wake every graph run whose `wake_at` has passed.
 *
 * Failures are per-run: one graph whose pinned version was deleted, or whose
 * resume throws, must not stop the other due runs from waking. Each is caught,
 * recorded on its own audit row, and the sweep continues.
 */
export async function sweepDueGraphWaits(
  input: SweepDueGraphWaitsInput
): Promise<WakeSweepResult> {
  const due = await input.requests.claimDueSleepers({
    limit: input.limit ?? DEFAULT_LIMIT,
    tenantId: input.tenantId,
    ...(input.now ? { now: input.now } : {}),
  });

  const result: WakeSweepResult = {
    claimed: due.length,
    failed: 0,
    resumed: 0,
  };

  for (const request of due) {
    if (
      !(request.run_id && request.workflow_id && request.workflow_version_id)
    ) {
      // Not a graph run, or missing its pin — nothing coherent to resume onto.
      // The claim already cleared `wake_at`, so it won't be retried forever.
      result.failed += 1;
      logger.warn("skipping wake for a run with no pinned graph version", {
        requestId: request.id,
        tenantId: input.tenantId,
      });
      continue;
    }

    try {
      const version = await input.graphs.getVersion({
        id: request.workflow_version_id,
        tenantId: input.tenantId,
      });
      if (!version) {
        // A run may never be resumed onto a DIFFERENT graph than it started
        // on — that is the whole point of pinning — so a missing version is a
        // dead run, not a reason to substitute the current one.
        throw new Error("pinned graph version is missing");
      }

      const outcome = await resumeGraphRun({
        ctx: {
          workflowId: request.workflow_id,
          workflowVersion: version.version,
          requestId: request.id,
          tenantId: input.tenantId,
          threadId: request.thread_id ?? "",
          ...(version.allowed_tools
            ? { allowedToolIds: version.allowed_tools }
            : {}),
          ...(request.context_type
            ? { contextType: request.context_type }
            : {}),
          ...(request.context_id ? { contextId: request.context_id } : {}),
          // No userId: nobody is at the keyboard. A woken run continues as the
          // service principal, with the tool allow-list the version was
          // published with — the same footing an unattended trigger runs on.
        },
        // The clock is the resumer, so the payload is just the fact of waking.
        // `wait_until` reads `woke_at`; every other resume field belongs to a
        // human decision and would be a lie here.
        resumeData: { woke_at: new Date().toISOString() },
        runId: request.run_id,
        version,
      });

      await settleGraphRun({
        outcome,
        outputSchema: version.output_schema,
        requestId: request.id,
        runId: request.run_id,
        tenantId: input.tenantId,
      });
      result.resumed += 1;
    } catch (err) {
      result.failed += 1;
      const reason = err instanceof Error ? err.message : String(err);
      logger.error("failed to wake a sleeping graph run", {
        error: reason,
        requestId: request.id,
        runId: request.run_id,
        tenantId: input.tenantId,
      });
      // Mark it failed rather than leaving it `dispatched`: a run that cannot
      // be resumed is over, and the runs list should say so instead of showing
      // it as in flight forever.
      await input.requests
        .finish({
          id: request.id,
          reason: `wake failed: ${reason}`,
          status: "failed",
          tenantId: input.tenantId,
        })
        .catch(() => {
          // best-effort — already logged above
        });
    }
  }

  return result;
}
