"use client";

import { type AGUIEvent, EventType } from "@engenty/ag-ui-bridge";
import {
  type FieldSuggestion,
  parseFieldSuggestionsArtifactCreatedValue,
} from "@engenty/ai-core/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveEngentyAiServiceBaseUrl } from "../ag-ui/apps-ai/apps-ai-api.js";
import { attachAppsAiRunStream } from "../ag-ui/apps-ai/apps-ai-transport.js";
import {
  cancelAiRun,
  getAiRun,
  getAiRunEvents,
} from "../lib/runtime/runs-api.js";

/**
 * Map a persisted run status to a terminal action phase, or null if the run is
 * still in flight. Source of truth when the SSE stream drops without delivering
 * a terminal event (a long run on a churny dev server can be cut mid-replay).
 */
function terminalPhaseForStatus(
  status: string
): Exclude<ActionRunPhase, "running"> | null {
  switch (status) {
    case "succeeded":
      return "completed";
    case "failed":
    case "timed_out":
      return "failed";
    case "cancelled":
      return "stopped";
    // A suspended run (HITL) is a settle point for THIS attach — the stream
    // closed; stop reconnecting and surface the approval/paused UI. The run
    // continues once resumed (a fresh attach picks up the rest).
    case "requires_action":
      return "requires_action";
    case "paused":
      return "paused";
    default:
      // queued / running / waiting_for_* — not terminal yet.
      return null;
  }
}

export type ActionRunPhase =
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  // Suspended for human input (approve/reject/answer) or held without a request.
  | "requires_action"
  | "paused";

/** One observable step of a run — a tool call (running → done). */
export interface ActionRunStep {
  detail?: string;
  id: string;
  label: string;
  status: "running" | "done";
}

export interface WorkflowRunStatusState {
  /** Artifact id of a pending field-suggestions proposal (HITL approval), if any. */
  artifactId: string | null;
  error: string | null;
  phase: ActionRunPhase;
  steps: ActionRunStep[];
  /** Field updates the run proposed for approval (from a proposeUpdates artifact). */
  suggestions: FieldSuggestion[];
  text: string;
}

export interface UseWorkflowRunStatusResult {
  /** Stop the run; null when there's no live (running) run to stop. */
  cancel: (() => void) | null;
  isCancelling: boolean;
  state: WorkflowRunStatusState | null;
}

function stringifyToolResult(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Attaches to a dispatched action run (SSE, replay from the start) and reports
 * live status: an ordered step list (tool calls), streamed text on success, or
 * the error message on failure. Borrows the same run-event stream the copilot
 * chat uses. Pass `null` to detach. Also exposes `cancel()` to stop a live run.
 */
export function useWorkflowRunStatus(
  runId: string | null
): UseWorkflowRunStatusResult {
  const [state, setState] = useState<WorkflowRunStatusState | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const textRef = useRef("");
  const stepsRef = useRef<ActionRunStep[]>([]);
  const suggestionsRef = useRef<FieldSuggestion[]>([]);
  const artifactIdRef = useRef<string | null>(null);
  // Once the user stops a run, the stream's trailing RUN_ERROR (the abort) must
  // not flip the phase back to "failed".
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!runId) {
      setState(null);
      return;
    }
    const baseUrl = resolveEngentyAiServiceBaseUrl();
    if (!baseUrl) {
      return;
    }
    cancelledRef.current = false;
    setIsCancelling(false);
    let stopped = false;
    const controller = new AbortController();

    const commit = (patch: Partial<WorkflowRunStatusState>) => {
      setState((prev) => ({
        artifactId: artifactIdRef.current,
        error: patch.error ?? prev?.error ?? null,
        phase: patch.phase ?? prev?.phase ?? "running",
        steps: [...stepsRef.current],
        suggestions: [...suggestionsRef.current],
        text: textRef.current,
      }));
    };

    // Per-attach terminal signal. `executor_lost` is NOT a real failure — it's the
    // server saying "no live executor right now" (e.g. a server reload mid-run, or
    // a durable run between resumes). Treat it as transient → reconnect.
    let outcome: "completed" | "failed" | "transient" | null = null;

    const onEvent = (event: AGUIEvent) => {
      if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
        const delta = (event as { delta?: string }).delta ?? "";
        if (delta) {
          textRef.current += delta;
          commit({});
        }
        return;
      }
      if (event.type === EventType.TOOL_CALL_START) {
        const e = event as { toolCallId?: string; toolCallName?: string };
        const id = e.toolCallId ?? `tool-${stepsRef.current.length}`;
        stepsRef.current = [
          ...stepsRef.current,
          { id, label: e.toolCallName?.trim() || "tool", status: "running" },
        ];
        commit({});
        return;
      }
      if (event.type === EventType.TOOL_CALL_RESULT) {
        const e = event as { content?: unknown; toolCallId?: string };
        // A proposeUpdates result carries a field_suggestions artifact (HITL) —
        // capture it so the run surfaces as "needs approval". Content may be the
        // object or a JSON string.
        let raw: unknown = e.content;
        if (typeof raw === "string") {
          try {
            raw = JSON.parse(raw);
          } catch {
            // not JSON — leave as-is
          }
        }
        const artifact = parseFieldSuggestionsArtifactCreatedValue(raw);
        if (artifact) {
          suggestionsRef.current = artifact.suggestions;
          artifactIdRef.current = artifact.artifact_id;
        }
        stepsRef.current = stepsRef.current.map((step) =>
          step.id === e.toolCallId
            ? {
                ...step,
                detail: stringifyToolResult(e.content),
                status: "done",
              }
            : step
        );
        commit({});
        return;
      }
      if (event.type === EventType.RUN_FINISHED) {
        stepsRef.current = stepsRef.current.map((step) =>
          step.status === "running" ? { ...step, status: "done" } : step
        );
        outcome = "completed";
        if (!cancelledRef.current) {
          commit({ phase: "completed" });
        }
        return;
      }
      if (event.type === EventType.RUN_ERROR) {
        const message = (event as { message?: string }).message ?? "Run failed";
        if (cancelledRef.current) {
          outcome = "failed";
          commit({ phase: "stopped" });
          return;
        }
        if (message === "executor_lost" || message === "run_suspended") {
          // executor_lost: no live executor right now — reconnect.
          // run_suspended: the workflow paused for approval — NOT a failure;
          // end this attach and let the status probe settle to requires_action.
          outcome = "transient";
          return;
        }
        outcome = "failed";
        commit({ error: message, phase: "failed" });
      }
    };

    // Reconnect loop: a dropped stream (server reload, transient network) or an
    // `executor_lost` must NOT surface as a failure — the run is durable and
    // resumes. Re-attach (full replay from -1, rebuilding state) until a real
    // terminal (completed / failed) or the retry budget is exhausted. Without
    // this, a long run on a churny dev server shows a false "Failed".
    const MAX_RECONNECTS = 40;
    const reconnectDelayMs = (attempt: number) =>
      Math.min(1000 + attempt * 750, 5000);

    const loop = async () => {
      for (let attempt = 0; !(stopped || cancelledRef.current); attempt++) {
        // Reset accumulators so the replay-from-start rebuilds clean state.
        textRef.current = "";
        stepsRef.current = [];
        suggestionsRef.current = [];
        artifactIdRef.current = null;
        outcome = null;
        setState({
          artifactId: null,
          error: null,
          phase: "running",
          steps: [],
          suggestions: [],
          text: "",
        });
        try {
          await attachAppsAiRunStream({
            onEvent,
            runId,
            serviceBaseUrl: baseUrl,
            signal: controller.signal,
            since: -1,
          });
        } catch {
          // Network/fetch drop → transient unless aborted/cancelled.
          if (stopped || controller.signal.aborted || cancelledRef.current) {
            return;
          }
          outcome = outcome ?? "transient";
        }
        // `outcome` is set inside the onEvent closure, which TS's flow analysis
        // can't see — read it back through its real type.
        const settled = outcome as "completed" | "failed" | "transient" | null;
        if (settled === "completed" || settled === "failed") {
          return;
        }
        if (stopped || cancelledRef.current) {
          return;
        }
        // The stream ended/dropped WITHOUT a terminal event (e.g. a long run cut
        // mid-replay by a dev-server reload). The run is durable — its persisted
        // status is the truth. If it has already finished, settle to that instead
        // of reconnecting forever (which leaves the spinner stuck on the last
        // tool step). Only keep retrying while the run is genuinely still live.
        try {
          const { summary } = await getAiRun(runId, controller.signal);
          const phase = terminalPhaseForStatus(summary.status);
          if (phase) {
            // Rebuild full state from the persisted event log — a single atomic
            // JSON response, not a drop-prone SSE replay — so suggestions/steps
            // captured AFTER the point the stream was cut aren't lost (otherwise
            // a needs-approval run could mis-settle to a bare "Done").
            try {
              const { events } = await getAiRunEvents(runId, controller.signal);
              textRef.current = "";
              stepsRef.current = [];
              suggestionsRef.current = [];
              artifactIdRef.current = null;
              for (const row of events) {
                onEvent(row.payload as AGUIEvent);
              }
            } catch {
              // Couldn't fetch the full log — settle on status alone below.
            }
            // Force the terminal phase + mark any leftover "running" steps done.
            stepsRef.current = stepsRef.current.map((step) =>
              step.status === "running" ? { ...step, status: "done" } : step
            );
            commit({
              phase,
              ...(phase === "failed" && summary.error
                ? { error: summary.error }
                : {}),
            });
            return;
          }
        } catch {
          // Status probe failed (network/abort) — fall through to reconnect.
          if (stopped || controller.signal.aborted || cancelledRef.current) {
            return;
          }
        }
        if (attempt >= MAX_RECONNECTS) {
          commit({ error: "stream lost", phase: "failed" });
          return;
        }
        await new Promise((r) => setTimeout(r, reconnectDelayMs(attempt)));
      }
    };
    void loop();

    return () => {
      stopped = true;
      controller.abort();
    };
  }, [runId]);

  const cancel = useCallback(() => {
    if (!runId || cancelledRef.current) {
      return;
    }
    cancelledRef.current = true;
    setIsCancelling(true);
    // Optimistic — the stream's trailing RUN_ERROR is swallowed by cancelledRef.
    setState((prev) => (prev ? { ...prev, phase: "stopped" } : prev));
    void cancelAiRun(runId, { reason: "user_cancel" })
      .catch(() => {
        // Best-effort: the run may already be terminal; the UI already reflects
        // the stopped intent.
      })
      .finally(() => setIsCancelling(false));
  }, [runId]);

  return {
    cancel: state?.phase === "running" ? cancel : null,
    isCancelling,
    state,
  };
}
