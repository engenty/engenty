import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";
import {
  isRunLiveInProcess,
  markRunDone,
  markRunLive,
  publishRunEvent,
  subscribeRunEvents,
} from "../run-event-bus.js";

const runId = () => crypto.randomUUID();

function makeEvent(type = "RUN_STARTED"): AGUIEvent {
  return { type, runId: "r1", threadId: "t1" } as AGUIEvent;
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
