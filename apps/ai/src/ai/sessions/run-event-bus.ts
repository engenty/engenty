// In-process pub/sub for live AG-UI run events. Persistence is the durable
// log; this bus only serves currently-attached SSE clients. Multi-instance
// fan-out (pg LISTEN/NOTIFY) is deliberately out of scope — see phase-1 doc D7.
import type { AGUIEvent } from "@engenty/ag-ui-bridge";

export interface BusEvent {
  event: AGUIEvent;
  /** Same monotonic counter the tracker uses — matches seq in agent_run_event. */
  seq: number;
}

type Subscriber = (e: BusEvent) => void;

const channels = new Map<string, Set<Subscriber>>();
const liveRuns = new Set<string>();

export function markRunLive(runId: string): void {
  liveRuns.add(runId);
}

export function markRunDone(runId: string): void {
  liveRuns.delete(runId);
  channels.delete(runId);
}

export function isRunLiveInProcess(runId: string): boolean {
  return liveRuns.has(runId);
}

export function publishRunEvent(runId: string, e: BusEvent): void {
  for (const sub of channels.get(runId) ?? []) {
    sub(e);
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
