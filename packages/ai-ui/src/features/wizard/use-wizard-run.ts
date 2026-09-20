"use client";

// One run, followed live for the wizard page.
//
// The snapshot is the truth (the gate, its surface, the answers so far, the
// node states); the run's SSE stream is the TRIGGER to re-read it. Every step
// that finishes, and every terminal or parked signal, refetches — so the page
// never has to poll the snapshot on a clock, and the streamed text of the
// running step is still there to show between two gates.

import { useCallback, useEffect, useState } from "react";
import {
  useWorkflowRunStatus,
  type WorkflowRunStatusState,
} from "../../hooks/use-workflow-run-status.js";
import { useWorkflowRunQuery } from "../workflow-canvas/workflow-queries.js";

/** How often to re-read a snapshot that lags the stream's verdict. */
const ALIGN_POLL_MS = 1500;

export interface WizardRun {
  query: ReturnType<typeof useWorkflowRunQuery>;
  /** Re-attach the stream — after a resume, the suspended attach has ended. */
  reattach: () => void;
  refetch: () => void;
  /** The live stream's view: running step, streamed text, or the error. */
  stream: WorkflowRunStatusState | null;
}

export function useWizardRun(runId: string | null): WizardRun {
  const query = useWorkflowRunQuery(runId ?? undefined, { poll: false });
  const [attachKey, setAttachKey] = useState(0);
  const { state: stream } = useWorkflowRunStatus(runId, { attachKey });
  const refetch = useCallback(() => {
    void query.refetch();
  }, [query.refetch]);

  // Where the snapshot stood when the person answered: status, the parked
  // gate and its recorded answer. A continuation is acknowledged at once and
  // runs in the background, so until the snapshot has moved off that point
  // it is re-read on a short clock — the stream alone can miss the window
  // between two visits of the same gate in a loop.
  const snapshot = query.data?.snapshot;
  const gateLeaf = snapshot?.gate?.stepId ?? "";
  const standing = snapshot
    ? `${snapshot.status}:${snapshot.gate?.path.join("/") ?? ""}:${JSON.stringify(
        gateLeaf ? (snapshot.answers?.[gateLeaf] ?? null) : null
      )}`
    : null;
  const [continuedFrom, setContinuedFrom] = useState<string | null>(null);
  const reattach = useCallback(() => {
    setAttachKey((key) => key + 1);
    setContinuedFrom(standing);
  }, [standing]);
  useEffect(() => {
    if (continuedFrom !== null && standing !== continuedFrom) {
      setContinuedFrom(null);
    }
  }, [continuedFrom, standing]);
  useEffect(() => {
    if (!(runId && continuedFrom !== null)) {
      return;
    }
    const timer = setInterval(refetch, ALIGN_POLL_MS);
    return () => clearInterval(timer);
  }, [continuedFrom, refetch, runId]);

  // The stream's signature changes exactly on TOOL_CALL_RESULT (a step done),
  // RUN_FINISHED and RUN_ERROR (a phase) — each one is a snapshot to re-read.
  const doneSteps = stream?.steps.filter((s) => s.status === "done").length;
  const signature = stream ? `${stream.phase}:${doneSteps}` : null;
  useEffect(() => {
    if (signature) {
      refetch();
    }
  }, [refetch, signature]);

  // While the engine is between two gates the snapshot is the only thing that
  // knows where it stopped, and a step's suspension is not a "done" the
  // stream counts — so a moving snapshot is re-read on a short clock until
  // it parks, settles or sleeps.
  const snapshotStatus = query.data?.snapshot?.status ?? null;
  const snapshotMoving =
    snapshotStatus === null || snapshotStatus === "running";
  useEffect(() => {
    if (!(runId && snapshotMoving)) {
      return;
    }
    const timer = setInterval(refetch, ALIGN_POLL_MS);
    return () => clearInterval(timer);
  }, [refetch, runId, snapshotMoving]);

  return { query, reattach, refetch, stream };
}
