// Park a suspended conversation Session in-process (Phase 3.2 HITL) so the
// resume POST can reattach and call `session.respondToToolSuspension`. A
// frontend tool suspends the run (`tool_suspended`), and the suspended state
// lives in the Session/controller pair — so we keep both alive (15-min TTL,
// unref'd) keyed by the suspended run id. A server restart loses it → the
// resume surfaces a clear RUN_ERROR (the suspended state was in-memory).
import type { FrontendToolDefinition } from "@engenty/ag-ui-bridge";
import type {
  ConversationController,
  ConversationSession,
} from "./controller-session.js";

const PARKED_TTL_MS = 15 * 60 * 1000;

interface ParkedSessionRun {
  // The controller owns the session's lifecycle — kept so the resume (or the
  // TTL expiry) can destroy it.
  controller: ConversationController;
  // Frontend tool definitions for this run — kept so a resumed leg that suspends
  // AGAIN (a second frontend tool in the same turn) can build the next interrupt.
  mergedDefinitions: readonly FrontendToolDefinition[];
  session: ConversationSession;
  threadId: string;
  timer: ReturnType<typeof setTimeout>;
}

const parkedSessionRuns = new Map<string, ParkedSessionRun>();

export function parkSessionRun(
  runId: string,
  run: {
    controller: ConversationController;
    session: ConversationSession;
    threadId: string;
    mergedDefinitions: readonly FrontendToolDefinition[];
  }
): void {
  // A re-park (second suspend in one turn) replaces the prior entry/timer.
  const existing = parkedSessionRuns.get(runId);
  if (existing) {
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(() => {
    const parked = parkedSessionRuns.get(runId);
    parkedSessionRuns.delete(runId);
    void parked?.controller.destroy().catch(() => {
      // best-effort cleanup on TTL expiry
    });
  }, PARKED_TTL_MS);
  (timer as { unref?: () => void }).unref?.();
  parkedSessionRuns.set(runId, { ...run, timer });
}

export function takeParkedSessionRun(
  runId: string
): ParkedSessionRun | undefined {
  const parked = parkedSessionRuns.get(runId);
  if (!parked) {
    return;
  }
  clearTimeout(parked.timer);
  parkedSessionRuns.delete(runId);
  return parked;
}
