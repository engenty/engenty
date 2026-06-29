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

describe("startQueueWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processes messages from registered queues", async () => {
    const handlerA = vi.fn().mockResolvedValue(undefined);
    const handlerB = vi.fn().mockResolvedValue(undefined);

    let popCallCount = 0;
    const mockQueue: QueueService = {
      pop: vi.fn(async (queueName: string) => {
        popCallCount++;
        // Return a message on the first call for each queue, then null
        if (popCallCount === 1 && queueName === "queue_a") {
          return {
            msg_id: 1,
            read_ct: 1,
            enqueued_at: "2026-03-22T00:00:00Z",
            vt: "2026-03-22T00:00:30Z",
            message: { task: "a" },
          };
        }
        if (popCallCount === 2 && queueName === "queue_b") {
          return {
            msg_id: 2,
            read_ct: 1,
            enqueued_at: "2026-03-22T00:00:00Z",
            vt: "2026-03-22T00:00:30Z",
            message: { task: "b" },
          };
        }
        return null;
      }),
      send: vi.fn(),
      sendBatch: vi.fn(),
      read: vi.fn(),
      archive: vi.fn(),
      delete: vi.fn(),
      metrics: vi.fn(),
    };

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
      queue: mockQueue,
      handlers,
      pollIntervalMs: 100,
    });

    // Let the poll loop run
    await vi.advanceTimersByTimeAsync(50);

    // Handlers should have been called
    expect(handlerA).toHaveBeenCalledWith(
      { task: "a" },
      { msgId: 1, readCount: 1 }
    );
    expect(handlerB).toHaveBeenCalledWith(
      { task: "b" },
      { msgId: 2, readCount: 1 }
    );

    stop();
  });

  it("continues processing after handler errors", async () => {
    const failingHandler = vi
      .fn()
      .mockRejectedValueOnce(new Error("handler crash"))
      .mockResolvedValue(undefined);

    let popCount = 0;
    const mockQueue: QueueService = {
      pop: vi.fn(async () => {
        popCount++;
        if (popCount <= 2) {
          return {
            msg_id: popCount,
            read_ct: 1,
            enqueued_at: "2026-03-22T00:00:00Z",
            vt: "2026-03-22T00:00:30Z",
            message: { n: popCount },
          };
        }
        return null;
      }),
      send: vi.fn(),
      sendBatch: vi.fn(),
      read: vi.fn(),
      archive: vi.fn(),
      delete: vi.fn(),
      metrics: vi.fn(),
    };

    const handlers = new Map<
      string,
      (
        payload: Record<string, unknown>,
        meta: { msgId: number; readCount: number }
      ) => Promise<void>
    >();
    handlers.set("test_q", failingHandler);

    const stop = startQueueWorker({
      queue: mockQueue,
      handlers,
      pollIntervalMs: 100,
    });

    // Let the first two messages process
    await vi.advanceTimersByTimeAsync(50);

    // Handler called twice — once failed, once succeeded
    expect(failingHandler).toHaveBeenCalledTimes(2);

    stop();
  });

  it("waits pollIntervalMs when no messages", async () => {
    const handler = vi.fn();
    const mockQueue: QueueService = {
      pop: vi.fn().mockResolvedValue(null),
      send: vi.fn(),
      sendBatch: vi.fn(),
      read: vi.fn(),
      archive: vi.fn(),
      delete: vi.fn(),
      metrics: vi.fn(),
    };

    const handlers = new Map<
      string,
      (
        payload: Record<string, unknown>,
        meta: { msgId: number; readCount: number }
      ) => Promise<void>
    >();
    handlers.set("empty_q", handler);

    const stop = startQueueWorker({
      queue: mockQueue,
      handlers,
      pollIntervalMs: 500,
    });

    // Pop should be called once immediately
    await vi.advanceTimersByTimeAsync(10);
    expect(mockQueue.pop).toHaveBeenCalledTimes(1);

    // After 500ms, should poll again
    await vi.advanceTimersByTimeAsync(500);
    expect(mockQueue.pop).toHaveBeenCalledTimes(2);

    // Handler should never have been called (no messages)
    expect(handler).not.toHaveBeenCalled();

    stop();
  });

  it("stops when stop function is called", async () => {
    const mockQueue: QueueService = {
      pop: vi.fn().mockResolvedValue(null),
      send: vi.fn(),
      sendBatch: vi.fn(),
      read: vi.fn(),
      archive: vi.fn(),
      delete: vi.fn(),
      metrics: vi.fn(),
    };

    const handlers = new Map<
      string,
      (
        payload: Record<string, unknown>,
        meta: { msgId: number; readCount: number }
      ) => Promise<void>
    >();
    handlers.set("q", vi.fn());

    const stop = startQueueWorker({
      queue: mockQueue,
      handlers,
      pollIntervalMs: 100,
    });

    await vi.advanceTimersByTimeAsync(10);
    const callsBefore = (mockQueue.pop as ReturnType<typeof vi.fn>).mock.calls
      .length;

    stop();

    // Advance well past the poll interval
    await vi.advanceTimersByTimeAsync(1000);
    const callsAfter = (mockQueue.pop as ReturnType<typeof vi.fn>).mock.calls
      .length;

    // Should not have made many more calls after stop
    expect(callsAfter - callsBefore).toBeLessThanOrEqual(1);
  });
});
