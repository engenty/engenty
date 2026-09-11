// Mutual exclusion for resuming a suspended run.
//
// A resume continues from Mastra's durable snapshot, so two answers to one
// approval can arrive concurrently — a double-click, or a retry racing the first
// request. Both would resolve the same suspension AND tear down the same
// thread-scoped sandbox, and a thread load running alongside them could read the
// interrupt as orphaned and clear it mid-resume. This registry admits one.
//
// In-process only, deliberately: a second server process cannot see these
// markers, but it also cannot double-resolve a snapshot — its resume either
// finds a suspended run or it does not.
const inFlightResumes = new Set<string>();

/** Whether a resume for this suspended run id is currently executing. */
export function isResumeInFlight(runId: string): boolean {
  return inFlightResumes.has(runId);
}

/**
 * Claim the marker for a resume. Returns false when one is already running,
 * which the caller must turn away — as "resume in progress", never as "the run
 * is gone", which reads as a restart and sends the user down the wrong path.
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

/** Release the claim (success or failure). */
export function releaseResumeInFlight(runId: string): void {
  inFlightResumes.delete(runId);
}
