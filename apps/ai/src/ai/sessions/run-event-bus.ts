// Live AG-UI run-event fan-out. Persistence (ai.agent_run_event) is the
// durable log and the ONLY replay source; this bus only serves currently-
// attached SSE clients with the live window.
//
// Fan-out rides `mastra.pubsub` (topic `engenty.run.<runId>`) when a PubSub is
// injected via `setRunEventPubSub` at boot — on the default in-process
// `EventEmitterPubSub` this is behavior-identical to the previous hand-rolled
// Map (publish emits synchronously, subscribe registers synchronously), and it
// makes multi-replica fan-out a backend flip (e.g. Redis Streams) instead of a
// custom transport. Without an injected PubSub (unit tests) the original
// in-process Map lane is used. The per-run live buffer stays per-process
// either way — it exists to close the subscribe-then-replay-DB seam for
// attaches to a run executing HERE; cross-replica attaches replay the DB.
import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import type { Event, PubSub } from "@mastra/core/events";
import { abortActiveRun } from "./run-abort-registry.js";

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

const RUN_EVENT_TOPIC_PREFIX = "engenty.run.";
const RUN_EVENT_TYPE = "engenty.agui";

function runTopic(runId: string): string {
  return RUN_EVENT_TOPIC_PREFIX + runId;
}

const RUN_CONTROL_TOPIC = "engenty.run-control";
const CANCEL_EVENT_TYPE = "engenty.cancel";

let runEventPubSub: PubSub | null = null;

// Cross-replica poke lane: a cancel POST can land on a replica that doesn't
// hold the run's AbortController. Every process subscribes to the control
// topic and applies pokes to its LOCAL registry — idempotent (aborting an
// absent/aborted controller is a no-op), at-most-once is fine because run
// state of record lives in Postgres, not in the poke.
const onRunControlEvent = (event: Event) => {
  if (event.type !== CANCEL_EVENT_TYPE) {
    return;
  }
  const runId = (event.data as { runId?: unknown } | null)?.runId;
  if (typeof runId === "string" && runId) {
    abortActiveRun(runId);
  }
};

/**
 * Install the process-wide PubSub the bus fans out through. Called once at
 * boot with `mastra.pubsub`; `null` restores the in-process fallback lane
 * (tests). Subscribers pick their lane at subscribe time, publishers deliver
 * to both lanes, so flipping mid-flight never double-delivers. Also owns the
 * control-topic subscription (cancel pokes).
 */
export function setRunEventPubSub(pubsub: PubSub | null): void {
  const previous = runEventPubSub;
  runEventPubSub = pubsub;
  if (previous) {
    void previous
      .unsubscribe(RUN_CONTROL_TOPIC, onRunControlEvent)
      .catch(() => {});
  }
  if (pubsub) {
    void pubsub.subscribe(RUN_CONTROL_TOPIC, onRunControlEvent).catch((err) => {
      console.error("run-event-bus: control-topic subscribe failed", err);
    });
  }
}

/**
 * Abort the run wherever it executes: locally right away, and by broadcast
 * poke to every other replica. Returns the LOCAL result only (true when this
 * process held the live controller) — a remote abort surfaces through the run
 * store, not this return value.
 */
export function requestRunCancellation(runId: string): boolean {
  const abortedHere = abortActiveRun(runId);
  if (runEventPubSub) {
    void runEventPubSub
      .publish(RUN_CONTROL_TOPIC, {
        data: { runId },
        runId,
        type: CANCEL_EVENT_TYPE,
      })
      .catch((err) => {
        console.error("run-event-bus: cancel poke publish failed", runId, err);
      });
  }
  return abortedHere;
}

interface PubSubSubscription {
  /**
   * Severed synchronously by unsubscribe/markRunDone. The transport-level
   * unsubscribe is a Promise (real work on async backends), but observable
   * delivery must stop in the SAME tick as today's Map lane — the wrapper
   * checks this flag before invoking the subscriber.
   */
  active: boolean;
  pubsub: PubSub;
  /** Resolves when the transport subscribe completed — unsubscribe chains on it. */
  ready: Promise<void>;
  wrapper: (event: Event) => void;
}

const pubsubSubscriptions = new Map<string, Set<PubSubSubscription>>();

function severPubSubSubscription(runId: string, sub: PubSubSubscription): void {
  if (!sub.active) {
    return;
  }
  sub.active = false;
  const topic = runTopic(runId);
  void sub.ready
    .then(() => sub.pubsub.unsubscribe(topic, sub.wrapper))
    .catch((err) => {
      console.error("run-event-bus: pubsub unsubscribe failed", runId, err);
    });
}

/** Fallback lane when no PubSub is injected (unit tests). */
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
  const subs = pubsubSubscriptions.get(runId);
  if (subs) {
    pubsubSubscriptions.delete(runId);
    for (const sub of subs) {
      severPubSubSubscription(runId, sub);
    }
  }
  if (runEventPubSub) {
    // No-op on EventEmitter; drops retained per-run stream state on backends
    // that keep it (e.g. Redis Streams). Best-effort by contract.
    void runEventPubSub.clearTopic(runTopic(runId)).catch(() => {});
  }
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
  if (runEventPubSub) {
    // EventEmitterPubSub emits synchronously inside this call; the Promise is
    // bookkeeping only. Callers stay fire-and-forget sync either way.
    void runEventPubSub
      .publish(runTopic(runId), {
        data: e,
        runId,
        type: RUN_EVENT_TYPE,
      })
      .catch((err) => {
        console.error("run-event-bus: pubsub publish failed", runId, err);
      });
  }
}

export function subscribeRunEvents(runId: string, sub: Subscriber): () => void {
  const pubsub = runEventPubSub;
  if (!pubsub) {
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
  const record: PubSubSubscription = {
    active: true,
    pubsub,
    ready: Promise.resolve(),
    wrapper: (event) => {
      if (!record.active || event.type !== RUN_EVENT_TYPE) {
        return;
      }
      sub(event.data as BusEvent);
    },
  };
  record.ready = pubsub
    .subscribe(runTopic(runId), record.wrapper)
    .catch((err) => {
      console.error("run-event-bus: pubsub subscribe failed", runId, err);
    }) as Promise<void>;
  let set = pubsubSubscriptions.get(runId);
  if (!set) {
    set = new Set();
    pubsubSubscriptions.set(runId, set);
  }
  set.add(record);
  return () => {
    const current = pubsubSubscriptions.get(runId);
    if (current) {
      current.delete(record);
      if (current.size === 0) {
        pubsubSubscriptions.delete(runId);
      }
    }
    severPubSubSubscription(runId, record);
  };
}
