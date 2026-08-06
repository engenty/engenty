import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  getLiveRunEventsSnapshot,
  isRunLiveInProcess,
  markRunDone,
  markRunLive,
  publishRunEvent,
  subscribeRunEvents,
} from "../run-event-bus.js";

const runId = () => crypto.randomUUID();

// Matches BusEvent["event"] — see the dual-zod note on that type for why the
// intersection is needed to get a usable `type` discriminant.
function makeEvent(type = "RUN_STARTED"): AGUIEvent & { type: string } {
  return { type, runId: "r1", threadId: "t1" } as AGUIEvent & { type: string };
}

describe("run-event-bus", () => {
  it("delivers published events to subscribers", () => {
    const id = runId();
    const received: unknown[] = [];
    const unsub = subscribeRunEvents(id, (e) => received.push(e));

    publishRunEvent(id, { event: makeEvent(), seq: 0 });
    publishRunEvent(id, { event: makeEvent("RUN_FINISHED"), seq: 1 });
    unsub();

    expect(received).toHaveLength(2);
    expect((received[0] as { seq: number }).seq).toBe(0);
    expect((received[1] as { seq: number }).seq).toBe(1);
  });

  it("does not deliver events after unsubscribe", () => {
    const id = runId();
    const received: unknown[] = [];
    const unsub = subscribeRunEvents(id, (e) => received.push(e));

    publishRunEvent(id, { event: makeEvent(), seq: 0 });
    unsub();
    publishRunEvent(id, { event: makeEvent(), seq: 1 });

    expect(received).toHaveLength(1);
  });

  it("supports multiple independent subscribers on the same run", () => {
    const id = runId();
    const a: number[] = [];
    const b: number[] = [];
    const unsubA = subscribeRunEvents(id, (e) => a.push(e.seq));
    const unsubB = subscribeRunEvents(id, (e) => b.push(e.seq));

    publishRunEvent(id, { event: makeEvent(), seq: 10 });
    publishRunEvent(id, { event: makeEvent(), seq: 11 });
    unsubA();
    publishRunEvent(id, { event: makeEvent(), seq: 12 });
    unsubB();

    expect(a).toEqual([10, 11]);
    expect(b).toEqual([10, 11, 12]);
  });

  it("markRunLive / isRunLiveInProcess / markRunDone lifecycle", () => {
    const id = runId();

    expect(isRunLiveInProcess(id)).toBe(false);
    markRunLive(id);
    expect(isRunLiveInProcess(id)).toBe(true);
    markRunDone(id);
    expect(isRunLiveInProcess(id)).toBe(false);
  });

  it("markRunDone clears all subscribers so no further events arrive", () => {
    const id = runId();
    const received: unknown[] = [];
    subscribeRunEvents(id, (e) => received.push(e));

    publishRunEvent(id, { event: makeEvent(), seq: 0 });
    markRunDone(id);
    publishRunEvent(id, { event: makeEvent(), seq: 1 });

    expect(received).toHaveLength(1);
  });

  it("buffers events published before any subscriber for a live run", () => {
    // Regression: an attached window subscribed and then replayed the DB — an
    // event published before the subscribe but committed after the read was
    // lost (seen live as the user-turn trio arriving without its text delta).
    // The snapshot must return everything published since markRunLive.
    const id = runId();
    markRunLive(id);
    publishRunEvent(id, { event: makeEvent("TEXT_MESSAGE_START"), seq: 0 });
    publishRunEvent(id, { event: makeEvent("TEXT_MESSAGE_CONTENT"), seq: 1 });

    const snapshot = getLiveRunEventsSnapshot(id);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.events.map((e) => e.seq)).toEqual([0, 1]);
    expect(snapshot?.truncatedBeforeSeq).toBe(-1);
    markRunDone(id);
  });

  it("returns null snapshot for runs not live in this process", () => {
    const id = runId();
    expect(getLiveRunEventsSnapshot(id)).toBeNull();
    markRunLive(id);
    markRunDone(id);
    expect(getLiveRunEventsSnapshot(id)).toBeNull();
  });

  it("a second markRunLive does not reset the buffer", () => {
    const id = runId();
    markRunLive(id);
    publishRunEvent(id, { event: makeEvent(), seq: 0 });
    markRunLive(id); // route + executor both mark — must be idempotent
    expect(getLiveRunEventsSnapshot(id)?.events).toHaveLength(1);
    markRunDone(id);
  });

  it("does not deliver events to a different run's subscribers", () => {
    const idA = runId();
    const idB = runId();
    const received: unknown[] = [];
    const unsub = subscribeRunEvents(idA, (e) => received.push(e));

    publishRunEvent(idB, { event: makeEvent(), seq: 0 });
    unsub();

    expect(received).toHaveLength(0);
  });
});
