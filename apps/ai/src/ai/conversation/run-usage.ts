// Token accounting for a conversation turn, shared by the START executor and
// both RESUME lanes.
//
// It lives here because the resume lanes used to skip metering entirely: an
// approval-gated turn does its cheap half before the gate and its expensive
// half after, and only the first half was ever billed or reported. The durable
// run row had the same hole — `tracker.complete()` was called with a status and
// nothing else, so a failed resume stored `error_message = NULL`.
import { type AiUsageStore, recordAiUsage } from "@engenty/ai-core";
import type { AiSessionScope } from "../sessions/types.js";

export interface RunUsage {
  cached?: number | null;
  input?: number | null;
  output?: number | null;
  reasoning?: number | null;
}

/** Map a Mastra `TokenUsage` to the `recordAiUsage` usage shape. */
export function usageFromSession(usage: unknown): RunUsage | null {
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const u = usage as {
    cachedInputTokens?: unknown;
    completionTokens?: unknown;
    promptTokens?: unknown;
    reasoningTokens?: unknown;
  };
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    cached: num(u.cachedInputTokens),
    input: num(u.promptTokens),
    output: num(u.completionTokens),
    reasoning: num(u.reasoningTokens),
  };
}

/** Meter a turn's tokens. Best-effort: usage must never fail a run. */
export async function recordSessionUsage(input: {
  agentId: string;
  modelId: string | null;
  runId: string;
  scope: AiSessionScope;
  threadId: string;
  usage: unknown;
  usageStore: AiUsageStore | null | undefined;
}): Promise<void> {
  if (!input.usageStore) {
    return;
  }
  const usage = usageFromSession(input.usage);
  if (!usage) {
    return;
  }
  try {
    await recordAiUsage({
      agent_id: input.agentId,
      feature: "copilot",
      model_id: input.modelId ?? "unknown",
      run_id: input.runId,
      store: input.usageStore,
      tenant_id: input.scope.tenantId,
      thread_id: input.threadId,
      usage,
      user_id: input.scope.userId,
    });
  } catch (error) {
    console.error(`[conversation ${input.runId}] usage failed:`, error);
  }
}
