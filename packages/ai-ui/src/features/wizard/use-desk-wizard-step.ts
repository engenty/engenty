"use client";

// The step a desk has to answer, found from the room you are in.
//
// A run parked at a gate is answerable on the agent's desk — that is the
// promise of work-model.md. Two kinds of run reach a desk, and the desk
// follows them differently:
//
// - a wizard the person PRESSED from the composer is this composer's business
//   from the press to the closing line: between two gates it is still the
//   thing they started, so the dock keeps saying so instead of going empty;
// - a routine fire the discovery hook finds on its own is narrated by the run
//   card in the transcript, so it docks only when it needs an answer.
//
// Either way the snapshot is the source of truth: it carries the gate, its
// surface and the previous answers.

import { useCallback, useEffect } from "react";
import { useAgentRoutineActivity } from "../agent-desk/use-agent-routine-activity.js";
import type {
  GraphRunAnswerDto,
  GraphRunGateDto,
  GraphRunSnapshotDto,
  WorkflowRunDto,
} from "../workflow-canvas/workflow-api.js";
import { useWorkflowRunQuery } from "../workflow-canvas/workflow-queries.js";

/** What the dock shows: the step, the wait between steps, or the ending. */
export type DeskWizardState = "gate" | "running" | "settled";

export interface DeskWizardStep {
  /** Prefill for the gate — its last answer, when the run was rewound. */
  answer: GraphRunAnswerDto | null;
  /** The parked step; null while the run is between gates or settled. */
  gate: GraphRunGateDto | null;
  refetch: () => void;
  runId: string;
  state: DeskWizardState;
  /** The graph's closing line, once it settled. */
  summary: string | null;
  /** The run's thread — where its artifacts and transcript live. */
  threadId: string | null;
}

export interface UseDeskWizardStepInput {
  agentId: string;
  /** A run this desk pressed itself; watched ahead of discovered fires. */
  pressedRunId?: string | null;
}

/** How often the dock asks again while a pressed run is between steps. */
const POLL_MS = 2000;

const SETTLED_RUN_STATUSES = new Set(["cancelled", "completed", "failed"]);
const SETTLED_SNAPSHOT_STATUSES = new Set([
  "canceled",
  "cancelled",
  "failed",
  "success",
]);

function isSettled(
  request: WorkflowRunDto | undefined,
  snapshot: GraphRunSnapshotDto | null | undefined
): boolean {
  return Boolean(
    (request && SETTLED_RUN_STATUSES.has(request.status)) ||
      (snapshot && SETTLED_SNAPSHOT_STATUSES.has(snapshot.status))
  );
}

/**
 * The run the desk should dock, or null when there is nothing to show. Polls
 * the snapshot while the run moves and stops when it settles; a resume
 * invalidates it, so the next step arrives without a reload.
 */
export function useDeskWizardStep(
  input: UseDeskWizardStepInput
): DeskWizardStep | null {
  const activity = useAgentRoutineActivity({ agentId: input.agentId });
  const pressedRunId = input.pressedRunId ?? null;
  const runId = pressedRunId ?? activity?.runId ?? null;
  const runQuery = useWorkflowRunQuery(runId ?? undefined);
  const refetch = useCallback(() => {
    void runQuery.refetch();
  }, [runQuery.refetch]);

  const request = runQuery.data?.request;
  const snapshot = runQuery.data?.snapshot;
  const gate = snapshot?.gate ?? null;
  const parked = Boolean(gate && snapshot?.status === "suspended");
  const settled = isSettled(request, snapshot);
  // The query stops polling on any snapshot that is not running — including
  // the moment between a step suspending and its gate being readable. The
  // dock owns a pressed run, so it keeps asking until the run parks or
  // settles; without this it says "working" forever on that one snapshot.
  const waitingForNextStep = Boolean(
    pressedRunId && runId && !(parked || settled)
  );
  useEffect(() => {
    if (!waitingForNextStep) {
      return;
    }
    const timer = setInterval(refetch, POLL_MS);
    return () => clearInterval(timer);
  }, [refetch, waitingForNextStep]);

  if (!runId) {
    return null;
  }
  // A discovered fire is narrated in the transcript; it belongs in the dock
  // only for the one thing the transcript cannot do — answer.
  if (!(pressedRunId || parked)) {
    return null;
  }
  const state: DeskWizardState = parked
    ? "gate"
    : settled
      ? "settled"
      : "running";
  return {
    answer: (gate && snapshot?.answers?.[gate.stepId]) ?? null,
    gate: parked ? gate : null,
    refetch,
    runId,
    state,
    summary: settled ? (request?.summary ?? request?.outcome ?? null) : null,
    threadId: request?.thread_id ?? activity?.threadId ?? null,
  };
}
