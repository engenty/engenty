// Stop a routine's open run — the one that makes every new start skip with
// `overlap`. The same two moves the canvas's cancel makes (abort the graph
// run, then settle its row), found by routine instead of by run id, so the
// agent's tool and the routine page reach it without knowing the run.
import type { WorkflowRunStore } from "../../dal/workflow-runs/workflow-run-store.js";
import type { WorkflowStore } from "../../dal/workflows/workflow-store.js";
import { cancelGraphRun } from "../workflows/dispatch.js";
import { settleGraphRun } from "../workflows/run-lifecycle.js";

export type CancelRoutineRunResult =
  | { runId: string; status: "cancelled" }
  /** Nothing is open: the next start is not blocked. */
  | { status: "none_active" }
  /** The run's pinned version is gone, so its graph cannot be stopped. */
  | { runId: string; status: "version_missing" };

export async function cancelActiveRoutineRun(input: {
  flowGraphs: WorkflowStore;
  requests: WorkflowRunStore;
  routineId: string;
  tenantId: string;
}): Promise<CancelRoutineRunResult> {
  const active = await input.requests.findActiveByRoutine({
    routineId: input.routineId,
    tenantId: input.tenantId,
  });
  if (!active?.run_id) {
    return { status: "none_active" };
  }
  const version = active.workflow_version_id
    ? await input.flowGraphs.getVersion({
        id: active.workflow_version_id,
        tenantId: input.tenantId,
      })
    : null;
  if (!version) {
    return { runId: active.run_id, status: "version_missing" };
  }
  await cancelGraphRun({ runId: active.run_id, version });
  await settleGraphRun({
    outcome: { reason: "cancelled by the person", status: "cancelled" },
    requestId: active.id,
    runId: active.run_id,
    tenantId: input.tenantId,
  });
  return { runId: active.run_id, status: "cancelled" };
}
