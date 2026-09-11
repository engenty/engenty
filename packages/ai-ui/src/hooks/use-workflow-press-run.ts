"use client";

import type { FieldSuggestion } from "@engenty/ai-core/browser";
// What a pressed Action is doing, assembled from its RUN.
//
// A press dispatches a subject-bound graph run (no task — see action-press.ts
// server-side), and the flow's agent works under its own CHILD run. So the
// three things the button shows come from two places:
//   · is it still going  → the flow run's snapshot
//   · what it did/said   → the agent's child run (steps + text)
//   · what it proposes   → the same child run's field-suggestion artifact
//
// The child run id comes from the flow run snapshot (`agentRuns`), which is the
// only path from a flow run to what its agent actually said.
import { useWorkflowRunQuery } from "../features/workflow-canvas/workflow-queries.js";
import {
  type ActionRunStep,
  useWorkflowRunStatus,
} from "./use-workflow-run-status.js";

export interface ActionPressRunState {
  phase: "running" | "completed" | "failed" | undefined;
  steps: ActionRunStep[];
  suggestions: FieldSuggestion[];
  text: string;
}

/**
 * The run the flow's agent node started, given the flow run. From outside, a
 * flow that had an agent do the work looks like it did nothing — the steps and
 * the answer live on the child run, and this is the only path to it.
 */
export function useActionPressAgentRunId(runId: string | null): string | null {
  const flowQuery = useWorkflowRunQuery(runId ?? undefined);
  return flowQuery.data?.snapshot?.agentRuns?.at(-1)?.runId ?? null;
}

export function useWorkflowPressRun(
  press: { runId: string } | null
): ActionPressRunState {
  // The flow run: its snapshot says whether the graph is still moving and which
  // child run the agent ran under.
  const flowQuery = useWorkflowRunQuery(press?.runId ?? undefined);
  const snapshot = flowQuery.data?.snapshot;
  const agentRunId = snapshot?.agentRuns?.at(-1)?.runId ?? null;

  // The agent's own run — the only place its steps, its answer and anything it
  // proposed exist.
  const { state: agentState } = useWorkflowRunStatus(agentRunId);

  if (!press) {
    return { phase: undefined, steps: [], suggestions: [], text: "" };
  }

  const flowStatus = snapshot?.status;
  const phase =
    flowStatus === "failed"
      ? ("failed" as const)
      : flowStatus === "success"
        ? ("completed" as const)
        : ("running" as const);

  return {
    phase,
    steps: agentState?.steps ?? [],
    suggestions: agentState?.suggestions ?? [],
    // On failure the agent's error is the useful message; on success its answer.
    text: (phase === "failed" ? agentState?.error : agentState?.text) ?? "",
  };
}
