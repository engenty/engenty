// The memory_approval consumer (memory Phase 4): modules/memory enqueues one
// dispatch per org-scoped memory proposal (agent writes land as
// status='proposed'); this consumer writes a high-priority platform-inbox
// record on the tenant partition so approvers see the pending proposal
// without watching the memory page. Queue name inlined so apps/ai keeps no
// build-time dependency on @engenty/memory (same contract style as the
// team-chat notification consumer).
import type { QueueService } from "@engenty/queue";
import { startQueueWorker } from "@engenty/queue";
import { createLogger } from "@engenty/telemetry";
import { z } from "zod";
import { emitInboxNotification } from "../notifications/inbox.js";

const logger = createLogger({ name: "memory-approval-consumer" });

const MEMORY_APPROVAL_QUEUE = "memory_approval";

const proposalDispatchSchema = z.object({
  agent_type_key: z.string().nullable(),
  kind: z.literal("memory_proposal"),
  record_id: z.string().min(1),
  slug: z.string().min(1),
  tenant_id: z.string().min(1),
  title: z.string(),
});

async function handleDispatch(payload: Record<string, unknown>) {
  const parsed = proposalDispatchSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn("memory approval dispatch ignored (bad shape)", {
      issues: parsed.error.issues.length,
    });
    return;
  }
  const dispatch = parsed.data;
  const proposer = dispatch.agent_type_key ?? "an agent";
  await emitInboxNotification({
    dedupeKey: `memory-proposal:${dispatch.tenant_id}:${dispatch.record_id}`,
    kind: "memory_proposal",
    metadata: {
      record_id: dispatch.record_id,
      slug: dispatch.slug,
      ...(dispatch.agent_type_key
        ? { agent_type_key: dispatch.agent_type_key }
        : {}),
    },
    priority: "high",
    source: "memory",
    summary: `${proposer} proposed an org-wide memory: "${dispatch.title}" — review it under Settings → Memory.`,
    tenantId: dispatch.tenant_id,
  });
}

export interface StartMemoryApprovalConsumerOptions {
  pollIntervalMs?: number;
  queue: QueueService;
}

export function startMemoryApprovalConsumer(
  options: StartMemoryApprovalConsumerOptions
): () => void {
  const handlers = new Map<
    string,
    (
      payload: Record<string, unknown>,
      meta: { msgId: number; readCount: number }
    ) => Promise<void>
  >();
  handlers.set(MEMORY_APPROVAL_QUEUE, async (payload, meta) => {
    try {
      await handleDispatch(payload);
    } catch (err) {
      logger.error("memory approval dispatch failed", {
        message: err instanceof Error ? err.message : String(err),
        msgId: meta.msgId,
      });
    }
  });
  const stop = startQueueWorker({
    handlers,
    queue: options.queue,
    ...(options.pollIntervalMs
      ? { pollIntervalMs: options.pollIntervalMs }
      : {}),
  });
  logger.info("memory approval consumer started");
  return stop;
}
