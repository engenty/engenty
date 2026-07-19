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

// Run ids whose parked session was TAKEN for a resume that has not yet
// completed (re-parked or finished). A second approval click landing in this
// window must be rejected as "resume in progress" — NOT "no longer in memory"
// (which reads as a server restart and, worse, used to race the live resume).
const inFlightResumes = new Set<string>();

/** Whether a resume for this suspended run id is currently executing. */
export function isParkedResumeInFlight(runId: string): boolean {
  return inFlightResumes.has(runId);
}

/**
 * Non-destructive check: is a suspended session still parked for this run id?
 * Used by thread-load reconciliation to tell a resumable interrupt (park
 * present) from an orphaned one (park lost to a restart / TTL / resume error).
 */
export function isSessionRunParked(runId: string): boolean {
  return parkedSessionRuns.has(runId);
}

/** Mark the resume for this suspended run id as finished (success or error). */
export function finishParkedResume(runId: string): void {
  inFlightResumes.delete(runId);
}

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
  // A (re-)park completes any in-flight resume transition for this run id.
  inFlightResumes.delete(runId);
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
  // The caller is about to drive the resume; until it re-parks or finishes,
  // duplicate resume attempts for this run id must be turned away.
  inFlightResumes.add(runId);
  return parked;
}
