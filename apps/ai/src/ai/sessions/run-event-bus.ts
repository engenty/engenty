// In-process pub/sub for live AG-UI run events. Persistence is the durable
// log; this bus only serves currently-attached SSE clients. Multi-instance
// fan-out (pg LISTEN/NOTIFY) is deliberately out of scope — see phase-1 doc D7.
import type { AGUIEvent } from "@engenty/ag-ui-bridge";

export interface BusEvent {
  /**
   * `AGUIEvent` is `z.infer<typeof EventSchemas>` in @ag-ui/core, which depends
   * on zod 3 while this app is on zod 4 — across that split the inference
   * collapses to `unknown`, so subscribers reading `e.event.type` fail to
   * compile. Intersecting with the discriminant we actually read keeps the
   * import meaningful without pretending the versions agree. Drop the
   * intersection once the tree is on a single zod.
   */
  event: AGUIEvent & { type: string };
  /** Same monotonic counter the tracker uses — matches seq in agent_run_event. */
  seq: number;
}

type Subscriber = (e: BusEvent) => void;

const channels = new Map<string, Set<Subscriber>>();
const liveRuns = new Set<string>();

// Full in-memory event log per live run. Persistence lags publish (deltas are
// coalesced and inserts are not awaited), so an attach that subscribes and then
// replays the DB can lose events published before the subscribe but committed
// after the read — seen live as the user-turn trio arriving without its text.
// Serving live runs from this buffer (read in the same tick as the subscribe)
// closes that seam entirely.
const MAX_BUFFERED_EVENTS_PER_RUN = 10_000;

interface RunEventBuffer {
  events: BusEvent[];
  /** Seqs below this were evicted by the cap — replay them from the DB. */
  truncatedBeforeSeq: number;
}

const buffers = new Map<string, RunEventBuffer>();

export function markRunLive(runId: string): void {
  liveRuns.add(runId);
  if (!buffers.has(runId)) {
    buffers.set(runId, { events: [], truncatedBeforeSeq: -1 });
  }
}

export function markRunDone(runId: string): void {
  liveRuns.delete(runId);
  channels.delete(runId);
  buffers.delete(runId);
}

/**
 * Snapshot of every event published so far for a run still live in this
 * process, or null when the run is not live here (finished, or executing on
 * another instance). Call it in the SAME tick as `subscribeRunEvents` — that
 * combination is seamless: nothing can be published between the two.
 */
export function getLiveRunEventsSnapshot(runId: string): {
  events: BusEvent[];
  truncatedBeforeSeq: number;
} | null {
  const buffer = buffers.get(runId);
  if (!buffer) {
    return null;
  }
  return {
    events: [...buffer.events],
    truncatedBeforeSeq: buffer.truncatedBeforeSeq,
  };
}

export function isRunLiveInProcess(runId: string): boolean {
  return liveRuns.has(runId);
}

export function publishRunEvent(
  runId: string,
  // Publishers hand over whatever @ag-ui/core produced (see BusEvent — that
  // import lands as `unknown` across the zod 3/4 split). The narrowing to a
  // readable `type` happens once, here, rather than at every publish site.
  e: { event: AGUIEvent; seq: number }
): void {
  const buffer = buffers.get(runId);
  if (buffer) {
    buffer.events.push(e as BusEvent);
    if (buffer.events.length > MAX_BUFFERED_EVENTS_PER_RUN) {
      const evicted = buffer.events.splice(
        0,
        Math.floor(MAX_BUFFERED_EVENTS_PER_RUN / 2)
      );
      const lastEvicted = evicted.at(-1);
      if (lastEvicted) {
        buffer.truncatedBeforeSeq = lastEvicted.seq + 1;
      }
    }
  }
  for (const sub of channels.get(runId) ?? []) {
    sub(e as BusEvent);
  }
}

export function subscribeRunEvents(runId: string, sub: Subscriber): () => void {
  let set = channels.get(runId);
  if (!set) {
    set = new Set();
    channels.set(runId, set);
  }
  set.add(sub);
  return () => {
    set?.delete(sub);
  };
}
