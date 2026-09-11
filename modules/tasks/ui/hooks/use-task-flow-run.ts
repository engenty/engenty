// The child runs a task's newest run started inside its graph nodes.
//
// It needs no new lookup: a run started for the task carries the task's own run
// id, so the newest run row on the task IS the run to read. A run that is not a
// graph run simply 404s and this reports nothing.
//
// A task never carries an Action body — running an Action is a routine or a
// press — so this only ever reports on what a run of the task did. Its one
// caller is the card that reviews the field updates such a run proposed; the
// underlying query polls itself while the run is moving, so that card is live
// without any streaming of its own.
import { useWorkflowRunQuery } from "@engenty/ai-ui/embed";
import type { TaskRun } from "../../src/schema/types.js";

/** The run any child run would belong to: the most recent one. */
function newestRunId(runs: TaskRun[]): string | null {
  if (runs.length === 0) {
    return null;
  }
  const sorted = [...runs].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
  return sorted.at(-1)?.agent_session_run_id ?? null;
}

export function useTaskFlowRun(runs: TaskRun[]) {
  const runId = newestRunId(runs);
  const runQuery = useWorkflowRunQuery(runId ?? undefined);
  const data = runId ? runQuery.data : undefined;

  return {
    /**
     * Runs the agent nodes started. A specialist runs as its own child run, so
     * what it said — and anything it proposed — is only reachable through these
     * ids, never through the parent run.
     */
    agentRuns: data?.snapshot?.agentRuns ?? [],
    runId,
  };
}
