// Park a suspended conversation Session in-process (Phase 3.2 HITL) so the
// resume POST can reattach and call `session.respondToToolSuspension`. A
// frontend tool suspends the run (`tool_suspended`), and the suspended state
// lives in the Session/controller pair — so we keep both alive (15-min TTL,
// unref'd) keyed by the suspended run id. A server restart loses it → the
// resume surfaces a clear RUN_ERROR (the suspended state was in-memory).
import type { FrontendToolDefinition } from "@engenty/ag-ui-bridge";
import type { EngentySandboxProvider } from "../sandbox/sandbox-provider.js";
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
  // The run's root sandbox provider, parked WITH the session because the parked
  // Workspace still references this exact Mastra sandbox instance. Tearing it
  // down at park time poisons the instance for good (`_destroy()` latches
  // `status = "destroyed"`, and `ensureRunning()` then throws
  // SandboxNotReadyError without ever reaching Docker), so the run teardown
  // hands ownership here instead — see `destroyRunSandboxes`.
  sandboxProvider?: EngentySandboxProvider;
  session: ConversationSession;
  threadId: string;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Release a parked run for good: the controller AND the sandbox whose lifecycle
 * was handed to the park. Call this on every terminal path (resume finished, TTL
 * expiry) — dropping the entry without it leaks a docker container and skips the
 * provider's `syncOut`, losing staged `/shared` + `/home` writes.
 */
export async function disposeParkedSessionRun(parked: {
  controller: ConversationController;
  sandboxProvider?: EngentySandboxProvider;
}): Promise<void> {
  await parked.controller.destroy().catch(() => {
    // best-effort cleanup
  });
  await parked.sandboxProvider?.destroy().catch(() => {
    // best-effort cleanup
  });
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

/**
 * Claim the in-flight marker for a resume that has NO park to take — the
 * snapshot (crash-recovery) lane. Returns false when a resume for this run is
 * already running, which the caller must turn away.
 *
 * `takeParkedSessionRun` claims it implicitly for the parked lane; without this
 * the snapshot lane had no mutual exclusion at all, so two answers for one run
 * both resolved AND destroyed the same session-scoped sandbox (the second
 * continuation then hit SandboxNotReadyError), and a concurrent thread load
 * could read the interrupt as orphaned and clear it mid-resume.
 *
 * Single-threaded check-and-set: safe because Node runs this to completion
 * between awaits.
 */
export function claimResumeInFlight(runId: string): boolean {
  if (inFlightResumes.has(runId)) {
    return false;
  }
  inFlightResumes.add(runId);
  return true;
}

export function parkSessionRun(
  runId: string,
  run: {
    controller: ConversationController;
    session: ConversationSession;
    threadId: string;
    mergedDefinitions: readonly FrontendToolDefinition[];
    sandboxProvider?: EngentySandboxProvider;
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
    if (parked) {
      void disposeParkedSessionRun(parked);
    }
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
