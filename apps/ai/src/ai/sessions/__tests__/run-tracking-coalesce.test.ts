import { EventType } from "@engenty/ag-ui-bridge";
import { describe, expect, it, vi } from "vitest";
import { createSessionRunTracker } from "../run-tracking.js";

const RUN_ID = "00000000-0000-4000-8000-000000000020";
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const THREAD_ID = "00000000-0000-4000-8000-000000000003";

function makeRunStore() {
  const persisted: Array<{
    eventType: string;
    seq: number;
    payload: Record<string, unknown>;
  }> = [];
  const runStore = {
    appendRunEvent: vi.fn(async (input) => {
      persisted.push({
        eventType: input.eventType,
        seq: input.seq,
        payload: input.payload,
      });
      return { event: {} };
    }),
    cancelRun: vi.fn(async () => ({ run: null })),
    createRun: vi.fn(async () => ({ run: {} })),
    finishRun: vi.fn(async () => ({ run: {} })),
    getRun: vi.fn(async () => null),
  };
  return { runStore, persisted };
}

function makeTracker(runStore: ReturnType<typeof makeRunStore>["runStore"]) {
  return createSessionRunTracker({
    agentId: "engenty.copilot",
    createdByUserId: "user-1",
    runId: RUN_ID,
    runStore: runStore as never,
    threadId: THREAD_ID,
    tenantId: TENANT_ID,
  });
}

describe("run-tracking coalescing boundaries", () => {
  it("flushes coalesced burst when a non-text event arrives", async () => {
    const { runStore, persisted } = makeRunStore();
    const tracker = makeTracker(runStore);

    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "a",
      messageId: "m1",
    });
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "b",
      messageId: "m1",
    });
    // TEXT_MESSAGE_END is non-text → flush
    await tracker.append({ type: EventType.TEXT_MESSAGE_END, messageId: "m1" });
    await tracker.complete({ status: "completed" });

    const textRows = persisted.filter(
      (r) => r.eventType === "TEXT_MESSAGE_CONTENT"
    );
    expect(textRows).toHaveLength(1);
    expect(textRows[0]?.payload.delta).toBe("ab");
  });

  it("uses the first seq of the burst for the coalesced DB row", async () => {
    const { runStore, persisted } = makeRunStore();
    const tracker = makeTracker(runStore);

    await tracker.append({
      type: EventType.RUN_STARTED,
      runId: RUN_ID,
      threadId: THREAD_ID,
    });
    // seq=1 is the first text delta
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "x",
      messageId: "m1",
    });
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "y",
      messageId: "m1",
    });
    await tracker.append({ type: EventType.TEXT_MESSAGE_END, messageId: "m1" });
    await tracker.complete({ status: "completed" });

    const textRow = persisted.find(
      (r) => r.eventType === "TEXT_MESSAGE_CONTENT"
    );
    expect(textRow?.seq).toBe(1);
  });

  it("flushes current burst and starts a new one when messageId changes", async () => {
    const { runStore, persisted } = makeRunStore();
    const tracker = makeTracker(runStore);

    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "m1",
      messageId: "msg-1",
    });
    // Different messageId → flush msg-1 burst, start msg-2
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "m2",
      messageId: "msg-2",
    });
    await tracker.complete({ status: "completed" });

    const textRows = persisted.filter(
      (r) => r.eventType === "TEXT_MESSAGE_CONTENT"
    );
    expect(textRows).toHaveLength(2);
    expect(textRows[0]?.payload.delta).toBe("m1");
    expect(textRows[1]?.payload.delta).toBe("m2");
  });

  it("flushes automatically when the buffer reaches 2048 bytes", async () => {
    const { runStore, persisted } = makeRunStore();
    const tracker = makeTracker(runStore);

    // Send two chunks: first just under limit, second pushes over
    const chunk1 = "a".repeat(2047);
    const chunk2 = "b"; // 2047+1 = 2048 → auto-flush
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: chunk1,
      messageId: "m1",
    });
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: chunk2,
      messageId: "m1",
    });
    // One more delta after the flush
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "c",
      messageId: "m1",
    });
    await tracker.complete({ status: "completed" });

    const textRows = persisted.filter(
      (r) => r.eventType === "TEXT_MESSAGE_CONTENT"
    );
    // First burst (2048 bytes) auto-flushed; second burst flushed on complete
    expect(textRows).toHaveLength(2);
    expect((textRows[0]?.payload.delta as string).length).toBe(2048);
    expect(textRows[1]?.payload.delta).toBe("c");
  });

  it("flushes pending buffer on cancel", async () => {
    const { runStore, persisted } = makeRunStore();
    const tracker = makeTracker(runStore);

    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "partial",
      messageId: "m1",
    });
    await tracker.cancel("aborted");

    const textRows = persisted.filter(
      (r) => r.eventType === "TEXT_MESSAGE_CONTENT"
    );
    expect(textRows).toHaveLength(1);
    expect(textRows[0]?.payload.delta).toBe("partial");
  });

  it("seq numbers are strictly monotonically increasing across all events", async () => {
    const { runStore, persisted } = makeRunStore();
    const tracker = makeTracker(runStore);

    await tracker.append({
      type: EventType.RUN_STARTED,
      runId: RUN_ID,
      threadId: THREAD_ID,
    });
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "hello",
      messageId: "m1",
    });
    await tracker.append({
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: " world",
      messageId: "m1",
    });
    await tracker.append({ type: EventType.TEXT_MESSAGE_END, messageId: "m1" });
    await tracker.complete({ status: "completed" });

    const seqs = persisted.map((r) => r.seq);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]!);
    }
  });
});
