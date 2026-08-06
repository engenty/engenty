import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import type {
  AgentRunStore,
  CreateAgentRunInput,
} from "../../dal/threads/agent-run-store.js";
import type { AgentRunStatus } from "../../dal/threads/types.js";
import { markRunDone, publishRunEvent } from "./run-event-bus.js";

/** Persist `ai.agent_run` before task checkout or other FK consumers. */
export async function ensureAgentRunStarted(
  runStore: AgentRunStore | null,
  input: CreateAgentRunInput
): Promise<void> {
  if (!runStore) {
    return;
  }
  const existing = await runStore.getRun({
    runId: input.id,
    tenantId: input.tenantId,
  });
  if (existing) {
    return;
  }
  try {
    await runStore.createRun(input);
  } catch (err) {
    // Two concurrent executors with the same runId (e.g. client retry with an
    // explicit runId) can both pass the getRun check and race to INSERT. Treat
    // a duplicate-key violation as "run already created" — the first executor
    // owns the row and this one should still proceed (or be aborted by the
    // abort registry if it's truly a duplicate).
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("duplicate key")) {
      throw err;
    }
  }
}

export function agUiEventToPayload(event: AGUIEvent): Record<string, unknown> {
  return event as unknown as Record<string, unknown>;
}

// Text delta coalescing: flush when the accumulated buffer exceeds this size.
const TEXT_COALESCE_FLUSH_BYTES = 2048;
// Tool-call args delta coalescing: same idea, keyed by toolCallId. A single
// tool call (e.g. proposeUpdates with a big suggestions[]) can emit 1000+
// TOOL_CALL_ARGS deltas; merge them into one row to keep the event log small.
const TOOL_ARGS_COALESCE_FLUSH_BYTES = 2048;

export interface SessionRunTracker {
  append: (event: AGUIEvent) => Promise<void>;
  cancel: (message?: string) => Promise<void>;
  complete: (input: {
    completionTokens?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    promptTokens?: number | null;
    status: AgentRunStatus;
  }) => Promise<void>;
}

export function createSessionRunTracker(params: {
  agentId: string;
  createdByUserId: string | null;
  modelId?: string | null;
  runId: string;
  runStore: AgentRunStore | null;
  threadId: string;
  tenantId: string;
}): SessionRunTracker {
  let seq = 0;
  let finished = false;

  // Coalescing buffer for TEXT_MESSAGE_CONTENT deltas.
  // Bus receives every delta; DB stores a single merged row per flush boundary.
  let textBuf: { messageId: string; delta: string; firstSeq: number } | null =
    null;
  // Coalescing buffer for TOOL_CALL_ARGS deltas (keyed by toolCallId).
  // textBuf and argsBuf are mutually exclusive: switching event type flushes the
  // other first, so at most one buffer is non-null at any time.
  let argsBuf: { toolCallId: string; delta: string; firstSeq: number } | null =
    null;

  const ensureStarted = ensureAgentRunStarted(params.runStore, {
    id: params.runId,
    tenantId: params.tenantId,
    threadId: params.threadId,
    agentId: params.agentId,
    modelId: params.modelId ?? null,
    createdByUserId: params.createdByUserId,
  });

  const persistEvent = async (
    eventType: string,
    payload: Record<string, unknown>,
    eventSeq: number
  ) => {
    if (!params.runStore) {
      return;
    }
    await ensureStarted;
    await params.runStore.appendRunEvent({
      runId: params.runId,
      tenantId: params.tenantId,
      threadId: params.threadId,
      seq: eventSeq,
      eventType,
      payload,
    });
  };

  const flushTextBuf = async () => {
    if (!textBuf) {
      return;
    }
    const { messageId, delta, firstSeq } = textBuf;
    textBuf = null;
    // Persist merged delta using the first seq of this burst (preserves ordering).
    await persistEvent(
      "TEXT_MESSAGE_CONTENT",
      { type: "TEXT_MESSAGE_CONTENT", messageId, delta },
      firstSeq
    );
  };

  const flushArgsBuf = async () => {
    if (!argsBuf) {
      return;
    }
    const { toolCallId, delta, firstSeq } = argsBuf;
    argsBuf = null;
    // Persist merged delta using the first seq of this burst (preserves ordering).
    await persistEvent(
      "TOOL_CALL_ARGS",
      { type: "TOOL_CALL_ARGS", toolCallId, delta },
      firstSeq
    );
  };

  return {
    async append(event) {
      const eventSeq = seq++;
      // Publish to bus immediately with full fidelity (including every text delta).
      publishRunEvent(params.runId, { event, seq: eventSeq });

      if (!params.runStore) {
        return;
      }

      // AGUIEvent narrows to `unknown` in this build — read `type` through a
      // minimal shape for the dispatch below.
      const evType = (event as { type?: string }).type;
      if (evType === "TEXT_MESSAGE_CONTENT") {
        // Switching event type → flush any pending args burst first (ordering).
        await flushArgsBuf();
        const e = event as { messageId?: string; delta?: string };
        const messageId = e.messageId ?? "";
        const delta = e.delta ?? "";
        // Different message → flush previous burst first.
        if (textBuf && textBuf.messageId !== messageId) {
          await flushTextBuf();
        }
        if (textBuf) {
          textBuf.delta += delta;
        } else {
          textBuf = { messageId, delta, firstSeq: eventSeq };
        }
        if (textBuf.delta.length >= TEXT_COALESCE_FLUSH_BYTES) {
          await flushTextBuf();
        }
        return;
      }

      if (evType === "TOOL_CALL_ARGS") {
        // Switching event type → flush any pending text burst first (ordering).
        await flushTextBuf();
        const e = event as { toolCallId?: string; delta?: string };
        const toolCallId = e.toolCallId ?? "";
        const delta = e.delta ?? "";
        // Different tool call → flush previous burst first.
        if (argsBuf && argsBuf.toolCallId !== toolCallId) {
          await flushArgsBuf();
        }
        if (argsBuf) {
          argsBuf.delta += delta;
        } else {
          argsBuf = { toolCallId, delta, firstSeq: eventSeq };
        }
        if (argsBuf.delta.length >= TOOL_ARGS_COALESCE_FLUSH_BYTES) {
          await flushArgsBuf();
        }
        return;
      }

      // Other event: flush any pending bursts, then persist this event.
      await flushTextBuf();
      await flushArgsBuf();
      await persistEvent(evType ?? "", agUiEventToPayload(event), eventSeq);
    },

    async cancel(message) {
      if (finished) {
        return;
      }
      finished = true;
      await flushTextBuf();
      await flushArgsBuf();
      if (params.runStore) {
        await ensureStarted;
        await params.runStore.cancelRun({
          runId: params.runId,
          tenantId: params.tenantId,
          errorMessage: message ?? "Run cancelled",
        });
      }
      markRunDone(params.runId);
    },

    async complete(input) {
      if (finished) {
        return;
      }
      finished = true;
      await flushTextBuf();
      await flushArgsBuf();
      if (params.runStore) {
        await ensureStarted;
        await params.runStore.finishRun({
          runId: params.runId,
          tenantId: params.tenantId,
          status: input.status,
          promptTokens: input.promptTokens ?? null,
          completionTokens: input.completionTokens ?? null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
        });
      }
      markRunDone(params.runId);
    },
  };
}

export function wrapEmitWithRunTracking(
  emit: (event: AGUIEvent) => void,
  tracker: SessionRunTracker
): (event: AGUIEvent) => void {
  return (event) => {
    emit(event);
    void tracker.append(event);
  };
}

export function readUsageTokenCounts(
  usage:
    | {
        inputTokens?: number;
        outputTokens?: number;
      }
    | null
    | undefined
): {
  completionTokens: number | null;
  promptTokens: number | null;
} {
  if (!usage) {
    return { completionTokens: null, promptTokens: null };
  }
  return {
    completionTokens:
      typeof usage.outputTokens === "number" ? usage.outputTokens : null,
    promptTokens:
      typeof usage.inputTokens === "number" ? usage.inputTokens : null,
  };
}
