// A run started from OUTSIDE a thread's chat pane (the Space home card sends
// into a desk, then opens it) handed to the pane that shows the thread. The
// pane's own discovery — "is a run in flight?" on mount, a realtime "running"
// signal — misses it: the mount check can run before the run is listed, and
// the thread was already running, so no signal follows. With the run id in
// hand the pane attaches to exactly that run.

/** A handoff older than this is a run nobody opened — let it go. */
const HANDOFF_TTL_MS = 2 * 60 * 1000;

const handoffs = new Map<string, { at: number; runId: string }>();
const listeners = new Set<(threadId: string) => void>();

/** Hand `runId` on `threadId` to whichever chat pane shows that thread. */
export function handOffThreadRun(threadId: string, runId: string): void {
  handoffs.set(threadId, { at: Date.now(), runId });
  for (const listener of listeners) {
    listener(threadId);
  }
}

/** The run handed off for `threadId`, if one is waiting. Does not consume it. */
export function peekThreadRunHandoff(threadId: string): string | null {
  const handoff = handoffs.get(threadId);
  if (!handoff) {
    return null;
  }
  if (Date.now() - handoff.at > HANDOFF_TTL_MS) {
    handoffs.delete(threadId);
    return null;
  }
  return handoff.runId;
}

/** Take the waiting run for `threadId`: the caller is now attaching to it. */
export function takeThreadRunHandoff(threadId: string): string | null {
  const runId = peekThreadRunHandoff(threadId);
  handoffs.delete(threadId);
  return runId;
}

export function subscribeThreadRunHandoffs(
  listener: (threadId: string) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetThreadRunHandoffsForTests(): void {
  handoffs.clear();
  listeners.clear();
}
