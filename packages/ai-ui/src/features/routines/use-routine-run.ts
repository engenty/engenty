"use client";

// "Run now" that stays honest about what happens next.
//
// The fire used to be the whole story: the button spun while the POST was in
// flight and stopped the moment it returned — which is the moment the work
// STARTS. A manual fire dispatches in-process and hands back a run id, so the
// button can follow the run to its end instead.
//
// A fire can also change nothing, and the service SAYS so rather than leaving
// the caller to infer it: `skipped` is `disabled`, `quiet_hours`, or `overlap`
// — that routine's previous RUN is still active, because overlap is decided on
// the run.
import { useCallback, useState } from "react";
import { useWorkflowRunStatus } from "../../hooks/use-workflow-run-status.js";
import type { RoutineSkipReason } from "./routines-api.js";
import { useRunRoutineNowMutation } from "./routines-queries.js";

export interface UseRoutineRunResult {
  /** Fire the routine and start watching its run. */
  fire: (routineId: string) => void;
  /** True from the click until the run settles (or the fire changed nothing). */
  isRunning: boolean;
  /** The routine currently being watched, for per-row spinners in a list. */
  runningRoutineId: string | null;
  /** Why the last fire changed nothing, or null when it started a run. */
  skipped: RoutineSkipReason | null;
}

export function useRoutineRun(): UseRoutineRunResult {
  const mutation = useRunRoutineNowMutation();
  const [runId, setRunId] = useState<string | null>(null);
  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<RoutineSkipReason | null>(null);
  const { state } = useWorkflowRunStatus(runId);

  const fire = useCallback(
    (routineId: string) => {
      setRunId(null);
      setSkipped(null);
      setRunningRoutineId(routineId);
      mutation.mutate(routineId, {
        onError: () => setRunningRoutineId(null),
        onSuccess: (result) => {
          // Nothing to watch when the fire changed nothing — stop spinning and
          // keep the reason so the caller can say why.
          if (result.skipped || !result.run_id) {
            setSkipped(result.skipped);
            setRunningRoutineId(null);
            return;
          }
          setRunId(result.run_id);
        },
      });
    },
    [mutation]
  );

  // A run that suspends for approval is no longer "running" — it is waiting on
  // a human, and the specialist's desk is where that gets answered.
  // `state` is null for the first tick after attaching — treat that as running
  // rather than letting the spinner blink off between fire and first event.
  const watching = Boolean(runId) && (!state || state.phase === "running");
  const isRunning = mutation.isPending || watching;

  return {
    fire,
    isRunning,
    runningRoutineId: isRunning ? runningRoutineId : null,
    skipped,
  };
}
