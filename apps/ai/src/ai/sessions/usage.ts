function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

async function resolveUsageCandidate(value: unknown) {
  if (!isPromiseLike(value)) {
    return value;
  }
  try {
    return await value;
  } catch {
    return null;
  }
}

function toUsageNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function usageFromOutput(value: unknown): Promise<{
  cached?: number | null;
  input?: number | null;
  output?: number | null;
  reasoning?: number | null;
} | null> {
  if (!value || typeof value !== "object") {
    return null;
  }
  const usage =
    (await resolveUsageCandidate(
      (value as { totalUsage?: unknown }).totalUsage
    )) ?? (await resolveUsageCandidate((value as { usage?: unknown }).usage));
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const typed = usage as {
    cachedInputTokens?: unknown;
    inputTokenDetails?: {
      cacheReadTokens?: unknown;
      cacheWriteTokens?: unknown;
    };
    inputTokens?: unknown;
    outputTokenDetails?: {
      reasoningTokens?: unknown;
    };
    outputTokens?: unknown;
    reasoningTokens?: unknown;
  };
  return {
    input: toUsageNumber(typed.inputTokens),
    output: toUsageNumber(typed.outputTokens),
    // AI SDK 7 moved these off the top-level usage object; keep legacy
    // fallbacks for Mastra / older provider payloads.
    cached:
      toUsageNumber(typed.inputTokenDetails?.cacheReadTokens) ??
      toUsageNumber(typed.cachedInputTokens),
    reasoning:
      toUsageNumber(typed.outputTokenDetails?.reasoningTokens) ??
      toUsageNumber(typed.reasoningTokens),
  };
}
