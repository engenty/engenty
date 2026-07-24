import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createQueueService,
  type QueueMessage,
  type QueueService,
  startQueueWorker,
} from "./index.js";

// ---------------------------------------------------------------------------
// Mock Supabase RPC client
// ---------------------------------------------------------------------------

function createMockClient() {
  const rpcResults = new Map<
    string,
    { data: unknown; error: { message: string } | null }
  >();

  const client = {
    rpc: vi.fn(
      (
        fn: string,
        _params?: Record<string, unknown>
      ): Promise<{ data: unknown; error: { message: string } | null }> => {
        const result = rpcResults.get(fn) ?? { data: null, error: null };
        return Promise.resolve(result);
      }
    ),
    /** Set what `.rpc(fn)` will return next time it's called. */
    _setResult(
      fn: string,
      data: unknown,
      error: { message: string } | null = null
    ) {
      rpcResults.set(fn, { data, error });
    },
    /** Set `.rpc(fn)` to return an error. */
    _setError(fn: string, message: string) {
      rpcResults.set(fn, { data: null, error: { message } });
    },
  };

  return client;
}

// ---------------------------------------------------------------------------
// QueueService tests
// ---------------------------------------------------------------------------

describe("createQueueService", () => {
  let client: ReturnType<typeof createMockClient>;
  let queue: QueueService;

  beforeEach(() => {
    client = createMockClient();
    queue = createQueueService(client);
  });

  describe("send", () => {
    it("sends a message and returns the message ID", async () => {
      client._setResult("pgmq_send", 42);

      const id = await queue.send("test_queue", { foo: "bar" });

      expect(id).toBe(42);
      expect(client.rpc).toHaveBeenCalledWith("pgmq_send", {
        queue: "test_queue",
        msg: { foo: "bar" },
        delay_sec: 0,
      });
    });

    it("passes delay seconds", async () => {
      client._setResult("pgmq_send", 99);

      const id = await queue.send("test_queue", { x: 1 }, 10);

      expect(id).toBe(99);
      expect(client.rpc).toHaveBeenCalledWith("pgmq_send", {
        queue: "test_queue",
        msg: { x: 1 },
        delay_sec: 10,
      });
    });

    it("throws on RPC error", async () => {
      client._setError("pgmq_send", "connection lost");

      await expect(queue.send("test_queue", { x: 1 })).rejects.toThrowError(
        "Queue pgmq_send failed: connection lost"
      );
    });
  });

  describe("sendBatch", () => {
    it("sends multiple messages and returns IDs", async () => {
      client._setResult("pgmq_send_batch", [1, 2, 3]);

      const ids = await queue.sendBatch("test_queue", [
        { a: 1 },
        { b: 2 },
        { c: 3 },
      ]);

      expect(ids).toEqual([1, 2, 3]);
      expect(client.rpc).toHaveBeenCalledWith("pgmq_send_batch", {
        queue: "test_queue",
        msgs: [{ a: 1 }, { b: 2 }, { c: 3 }],
        delay_sec: 0,
      });
    });

    it("returns empty array when null data", async () => {
      client._setResult("pgmq_send_batch", null);

      const ids = await queue.sendBatch("test_queue", [{ a: 1 }]);

      expect(ids).toEqual([]);
    });
  });

  describe("pop", () => {
    it("returns a message when available", async () => {
      const msg: QueueMessage = {
        msg_id: 7,
        read_ct: 1,
        enqueued_at: "2026-03-22T00:00:00Z",
        vt: "2026-03-22T00:00:30Z",
        message: { action: "process" },
      };
      client._setResult("pgmq_pop", [msg]);

      const result = await queue.pop("test_queue");

      expect(result).toEqual(msg);
      expect(client.rpc).toHaveBeenCalledWith("pgmq_pop", {
        queue: "test_queue",
      });
    });

    it("returns null when queue is empty", async () => {
      client._setResult("pgmq_pop", []);

      const result = await queue.pop("test_queue");

      expect(result).toBeNull();
    });

    it("returns null when data is null", async () => {
      client._setResult("pgmq_pop", null);

      const result = await queue.pop("test_queue");

      expect(result).toBeNull();
    });

    it("parses stringified message JSON", async () => {
      const msg = {
        msg_id: 8,
        read_ct: 1,
        enqueued_at: "2026-03-22T00:00:00Z",
        vt: "2026-03-22T00:00:30Z",
        message: JSON.stringify({ action: "classify" }),
      };
      client._setResult("pgmq_pop", [msg]);

      const result = await queue.pop("test_queue");

      expect(result?.message).toEqual({ action: "classify" });
    });
  });

  describe("read", () => {
    it("reads messages with visibility timeout", async () => {
      const msgs: QueueMessage[] = [
        {
          msg_id: 1,
          read_ct: 0,
          enqueued_at: "2026-03-22T00:00:00Z",
          vt: "2026-03-22T00:00:30Z",
          message: { a: 1 },
        },
        {
          msg_id: 2,
          read_ct: 0,
          enqueued_at: "2026-03-22T00:00:01Z",
          vt: "2026-03-22T00:00:31Z",
          message: { b: 2 },
        },
      ];
      client._setResult("pgmq_read", msgs);

      const result = await queue.read("test_queue", 30, 5);

      expect(result).toHaveLength(2);
      expect(result[0].msg_id).toBe(1);
      expect(client.rpc).toHaveBeenCalledWith("pgmq_read", {
        queue: "test_queue",
        vt: 30,
        n: 5,
      });
    });

    it("returns empty array when null", async () => {
      client._setResult("pgmq_read", null);

      const result = await queue.read("test_queue", 30, 5);

      expect(result).toEqual([]);
    });
  });

  describe("archive", () => {
    it("archives a message", async () => {
      client._setResult("pgmq_archive", true);

      const result = await queue.archive("test_queue", 42);

      expect(result).toBe(true);
      expect(client.rpc).toHaveBeenCalledWith("pgmq_archive", {
        queue: "test_queue",
        msg_id: 42,
      });
    });
  });

  describe("delete", () => {
    it("deletes a message", async () => {
      client._setResult("pgmq_delete", true);

      const result = await queue.delete("test_queue", 42);

      expect(result).toBe(true);
      expect(client.rpc).toHaveBeenCalledWith("pgmq_delete", {
        queue: "test_queue",
        msg_id: 42,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Queue Worker tests
// ---------------------------------------------------------------------------

function emptyMockQueue(overrides: Partial<QueueService> = {}): QueueService {
  return {
    archive: vi.fn().mockResolvedValue(true),
    delete: vi.fn(),
    metrics: vi.fn(),
    pop: vi.fn(),
    read: vi.fn().mockResolvedValue([]),
    send: vi.fn(),
    sendBatch: vi.fn(),
    ...overrides,
  };
}

function workerMsg(
  id: number,
  message: Record<string, unknown>,
  readCt = 1
): QueueMessage {
  return {
    enqueued_at: "2026-03-22T00:00:00Z",
    message,
    msg_id: id,
    read_ct: readCt,
    vt: "2026-03-22T00:02:00Z",
  };
}

describe("startQueueWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("archives on success", async () => {
    const handlerA = vi.fn().mockResolvedValue(undefined);
    const handlerB = vi.fn().mockResolvedValue(undefined);

    let readCallCount = 0;
    const mockQueue = emptyMockQueue({
      read: vi.fn(async (queueName: string) => {
        readCallCount++;
        if (readCallCount === 1 && queueName === "queue_a") {
          return [workerMsg(1, { task: "a" })];
        }
        if (readCallCount === 2 && queueName === "queue_b") {
          return [workerMsg(2, { task: "b" })];
        }
        return [];
      }),
    });

    const handlers = new Map<
      string,
      (
        payload: Record<string, unknown>,
        meta: { msgId: number; readCount: number }
      ) => Promise<void>
    >();
    handlers.set("queue_a", handlerA);
    handlers.set("queue_b", handlerB);

    const stop = startQueueWorker({
      handlers,
      pollIntervalMs: 100,
      queue: mockQueue,
      visibilitySeconds: 90,
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(handlerA).toHaveBeenCalledWith(
      { task: "a" },
      { msgId: 1, readCount: 1 }
    );
    expect(handlerB).toHaveBeenCalledWith(
      { task: "b" },
      { msgId: 2, readCount: 1 }
    );
    expect(mockQueue.archive).toHaveBeenCalledWith("queue_a", 1);
    expect(mockQueue.archive).toHaveBeenCalledWith("queue_b", 2);
    expect(mockQueue.read).toHaveBeenCalledWith("queue_a", 90, 1);

    stop();
  });

  it("does not archive on handler failure (redelivery)", async () => {
    const failingHandler = vi
      .fn()
      .mockRejectedValue(new Error("handler crash"));

    let reads = 0;
    const mockQueue = emptyMockQueue({
      read: vi.fn(async () => {
        reads += 1;
        return reads === 1 ? [workerMsg(9, { n: 1 })] : [];
      }),
    });

    const handlers = new Map<
      string,
      (
        payload: Record<string, unknown>,
        meta: { msgId: number; readCount: number }
      ) => Promise<void>
    >();
    handlers.set("test_q", failingHandler);

    const stop = startQueueWorker({
      handlers,
      pollIntervalMs: 100,
      queue: mockQueue,
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(failingHandler).toHaveBeenCalledTimes(1);
    expect(mockQueue.archive).not.toHaveBeenCalled();

    stop();
  });

  it("dead-letters when read_ct exceeds maxReads", async () => {
    const handler = vi.fn();
    let reads = 0;
    const mockQueue = emptyMockQueue({
      read: vi.fn(async () => {
        reads += 1;
        return reads === 1 ? [workerMsg(3, { poison: true }, 6)] : [];
      }),
    });

    const stop = startQueueWorker({
      handlers: new Map([["poison_q", handler]]),
      maxReads: 5,
      pollIntervalMs: 100,
      queue: mockQueue,
    });

    await vi.advanceTimersByTimeAsync(50);

    expect(handler).not.toHaveBeenCalled();
    expect(mockQueue.archive).toHaveBeenCalledWith("poison_q", 3);

    stop();
  });

  it("waits pollIntervalMs when no messages", async () => {
    const handler = vi.fn();
    const mockQueue = emptyMockQueue({
      read: vi.fn().mockResolvedValue([]),
    });

    const handlers = new Map<
      string,
      (
        payload: Record<string, unknown>,
        meta: { msgId: number; readCount: number }
      ) => Promise<void>
    >();
    handlers.set("empty_q", handler);

    const stop = startQueueWorker({
      handlers,
      pollIntervalMs: 500,
      queue: mockQueue,
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(mockQueue.read).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(mockQueue.read).toHaveBeenCalledTimes(2);
    expect(handler).not.toHaveBeenCalled();

    stop();
  });

  it("stops when stop function is called", async () => {
    const mockQueue = emptyMockQueue({
      read: vi.fn().mockResolvedValue([]),
    });

    const handlers = new Map<
      string,
      (
        payload: Record<string, unknown>,
        meta: { msgId: number; readCount: number }
      ) => Promise<void>
    >();
    handlers.set("q", vi.fn());

    const stop = startQueueWorker({
      handlers,
      pollIntervalMs: 100,
      queue: mockQueue,
    });

    await vi.advanceTimersByTimeAsync(10);
    const callsBefore = (mockQueue.read as ReturnType<typeof vi.fn>).mock.calls
      .length;

    stop();

    await vi.advanceTimersByTimeAsync(1000);
    const callsAfter = (mockQueue.read as ReturnType<typeof vi.fn>).mock.calls
      .length;

    expect(callsAfter - callsBefore).toBeLessThanOrEqual(1);
  });
});
