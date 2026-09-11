// Token accounting for a conversation turn, shared by the START executor and
// both RESUME lanes.
//
// Shared because an approval-gated turn splits across lanes: the cheap half runs
// before the gate and the expensive half after. Metering only the start lane
// silently under-bills every gated turn, so both resume lanes meter too, and
// `tracker.complete()` carries the failure message rather than a bare status.
import { type AiUsageStore, recordAiUsage } from "@engenty/ai-core";
import type { AiSessionScope } from "../sessions/types.js";

export interface RunUsage {
  cached?: number | null;
  input?: number | null;
  output?: number | null;
  reasoning?: number | null;
}

/** Meter a turn's tokens. Best-effort: usage must never fail a run. */
export async function recordSessionUsage(input: {
  agentId: string;
  modelId: string | null;
  runId: string;
  scope: AiSessionScope;
  threadId: string;
  /**
   * Already normalized: every producer exposes `runUsage`, so normalization
   * happens at the source. Do not accept a raw provider shape here — a producer
   * that spells usage differently would then meter nothing, silently.
   */
  usage: RunUsage | null;
  usageStore: AiUsageStore | null | undefined;
}): Promise<void> {
  if (!(input.usageStore && input.usage)) {
    return;
  }
  const usage = input.usage;
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

/**
 * The AG-UI driver's usage, normalized to `RunUsage`.
 *
 * `@ag-ui/mastra` reports `TokenUsage[]` on `RUN_FINISHED.usage` — one entry per
 * model call — where the Session path accumulated a single running total on the
 * converter. Two of the four field names already match (`cachedInputTokens`,
 * `reasoningTokens`); only input/output are spelled differently.
 *
 * `entries` is summed for the run total. Pass `lastOnly` for window occupancy, which
 * is the LAST call's input rather than the sum — the same distinction the Session
 * path drew between `totalUsage` and `lastUsage`, and summing there would report a
 * context window several times larger than any single call actually used.
 *
 * Invariants carried over: cached ⊆ input, reasoning ⊆ output.
 */
export function usageFromAgUiTokens(
  entries: unknown,
  options?: { lastOnly?: boolean }
): RunUsage | null {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  const considered = options?.lastOnly ? [entries.at(-1)] : entries;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  let cached: number | null = null;
  let input: number | null = null;
  let output: number | null = null;
  let reasoning: number | null = null;
  const add = (total: number | null, next: number | null) =>
    next === null ? total : (total ?? 0) + next;
  for (const raw of considered) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const u = raw as {
      cachedInputTokens?: unknown;
      inputTokens?: unknown;
      outputTokens?: unknown;
      reasoningTokens?: unknown;
    };
    cached = add(cached, num(u.cachedInputTokens));
    input = add(input, num(u.inputTokens));
    output = add(output, num(u.outputTokens));
    reasoning = add(reasoning, num(u.reasoningTokens));
  }
  return { cached, input, output, reasoning };
}
