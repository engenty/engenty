/**
 * @engenty/queue — General-purpose queue service wrapping Supabase pgmq.
 *
 * Uses pgmq functions via public RPC wrapper functions.
 * Works with both local Supabase (pgmq schema) and hosted (pgmq_public schema).
 */
import { createLogger } from "@engenty/telemetry";

const logger = createLogger({ name: "queue" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A message read from a queue. */
export interface QueueMessage<T = Record<string, unknown>> {
  enqueued_at: string;
  message: T;
  msg_id: number;
  read_ct: number;
  /** Visibility timeout — message invisible to other consumers until this time. */
  vt: string;
}

/** Metrics for a single queue. */
export interface QueueMetrics {
  oldest_msg_age_seconds: number | null;
  queue_length: number;
}

/** Core queue operations. */
export interface QueueService {
  /** Archive a processed message (move to archive table). */
  archive(queue: string, messageId: number): Promise<boolean>;
  /** Permanently delete a message from the queue. */
  delete(queue: string, messageId: number): Promise<boolean>;
  /** Get queue metrics (depth + oldest message age). */
  metrics(queue: string): Promise<QueueMetrics>;
  /** Pop next available message (read + delete atomically). */
  pop(queue: string): Promise<QueueMessage | null>;
  /** Read messages with a visibility timeout (seconds). */
  read(
    queue: string,
    visibilitySeconds: number,
    count: number
  ): Promise<QueueMessage[]>;
  /** Send a single message to a queue. Returns the message ID. */
  send(
    queue: string,
    payload: Record<string, unknown>,
    delaySec?: number
  ): Promise<number>;
  /** Send a batch of messages. Returns an array of message IDs. */
  sendBatch(
    queue: string,
    payloads: Record<string, unknown>[],
    delaySec?: number
  ): Promise<number[]>;
}

/** Handler function for processing a queue job. */
export type JobHandler<T = Record<string, unknown>> = (
  payload: T,
  meta: { msgId: number; readCount: number }
) => Promise<void>;

// ---------------------------------------------------------------------------
// Supabase-backed implementation
// ---------------------------------------------------------------------------

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

/** Minimal Supabase client shape needed for queue operations. */
interface SupabaseClientLike {
  rpc(fn: string, params?: Record<string, unknown>): PromiseLike<RpcResult>;
}

/**
 * Create a QueueService backed by Supabase pgmq.
 * Uses public.pgmq_* wrapper functions created by the migration.
 */
export function createQueueService(client: SupabaseClientLike): QueueService {
  const callRpc = async (
    fn: string,
    params?: Record<string, unknown>
  ): Promise<unknown> => {
    const result = await client.rpc(fn, params);
    if (result.error) {
      throw new Error(`Queue ${fn} failed: ${result.error.message}`);
    }
    return result.data;
  };

  return {
    async send(queue, payload, delaySec = 0) {
      const data = await callRpc("pgmq_send", {
        queue,
        msg: payload,
        delay_sec: delaySec,
      });
      return data as number;
    },

    async sendBatch(queue, payloads, delaySec = 0) {
      const data = await callRpc("pgmq_send_batch", {
        queue,
        msgs: payloads,
        delay_sec: delaySec,
      });
      return (data as number[]) ?? [];
    },

    async pop(queue) {
      const data = await callRpc("pgmq_pop", { queue });
      const rows = data as QueueMessage[] | null;
      if (!rows || (Array.isArray(rows) && rows.length === 0)) {
        return null;
      }
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row && typeof row.message === "string") {
        row.message = JSON.parse(row.message as string);
      }
      return row;
    },

    async read(queue, visibilitySeconds, count) {
      const data = await callRpc("pgmq_read", {
        queue,
        vt: visibilitySeconds,
        n: count,
      });
      const rows = (data as QueueMessage[]) ?? [];
      for (const row of rows) {
        if (typeof row.message === "string") {
          row.message = JSON.parse(row.message as string);
        }
      }
      return rows;
    },

    async archive(queue, messageId) {
      const data = await callRpc("pgmq_archive", {
        queue,
        msg_id: messageId,
      });
      return data as boolean;
    },

    async delete(queue, messageId) {
      const data = await callRpc("pgmq_delete", {
        queue,
        msg_id: messageId,
      });
      return data as boolean;
    },

    async metrics(queue) {
      const data = await callRpc("pgmq_metrics", { queue_name: queue });
      const rows = data as Array<{
        queue_length?: number;
        oldest_msg_age_sec?: number | null;
      }> | null;
      const row = Array.isArray(rows) ? rows[0] : rows;
      return {
        queue_length: Number(row?.queue_length ?? 0),
        oldest_msg_age_seconds:
          row?.oldest_msg_age_sec == null
            ? null
            : Number(row.oldest_msg_age_sec),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Queue Worker
// ---------------------------------------------------------------------------

export interface QueueWorkerConfig {
  /** Handler map: queue name → job handler */
  handlers: Map<
    string,
    (
      payload: Record<string, unknown>,
      meta: { msgId: number; readCount: number }
    ) => Promise<void>
  >;
  /** Polling interval in milliseconds (default: 2000) */
  pollIntervalMs?: number;
  /** Queue service instance */
  queue: QueueService;
}

/**
 * Start a polling-based queue worker that processes jobs from registered queues.
 * Returns a stop function.
 */
export function startQueueWorker(config: QueueWorkerConfig): () => void {
  const { queue, handlers, pollIntervalMs = 2000 } = config;
  const queueNames = [...handlers.keys()];
  let running = true;

  logger.info("Queue worker starting", {
    queues: queueNames,
    pollIntervalMs,
  });

  const poll = async () => {
    while (running) {
      let processed = 0;
      for (const queueName of queueNames) {
        if (!running) {
          break;
        }
        try {
          const msg = await queue.pop(queueName);
          if (!msg) {
            continue;
          }

          processed++;
          const handler = handlers.get(queueName)!;
          logger.info("Processing queue job", {
            queue: queueName,
            msgId: msg.msg_id,
            readCount: msg.read_ct,
          });

          try {
            await handler(msg.message as Record<string, unknown>, {
              msgId: msg.msg_id,
              readCount: msg.read_ct,
            });
            logger.info("Queue job completed", {
              queue: queueName,
              msgId: msg.msg_id,
            });
          } catch (err) {
            logger.error("Queue job failed", {
              queue: queueName,
              msgId: msg.msg_id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } catch (err) {
          if (err instanceof Error && !err.message.includes("does not exist")) {
            logger.warn("Queue poll error", {
              queue: queueName,
              error: err.message,
            });
          }
        }
      }

      if (processed === 0) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }
  };

  poll().catch((err) => {
    logger.error("Queue worker crashed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return () => {
    running = false;
    logger.info("Queue worker stopping");
  };
}
