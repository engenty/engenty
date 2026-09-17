// The recalled-history budget (`TokenLimiterProcessor`) derived from the model
// the agent will actually run on, instead of one number for every model.
//
// What the limiter counts is the message list: recalled history, observational
// memory, the current turn and this run's tool transcript. What it does NOT
// count is everything else the provider receives — the tool block (measured at
// ~40% of a copilot prompt), the runtime-context tail appended after the
// limiter, and the reply the model has still to write. The budget therefore
// starts from the catalog's `context_tokens` and subtracts those.

import type { AiUsageStore } from "@engenty/ai-core";
import type { AiGatewayModelStore } from "../../gateway-models.js";
import { describePromptTool } from "../sessions/prompt-preview.js";

/** Env: hard override of the history budget, in tokens. */
export const ENGENTY_AI_HISTORY_TOKEN_LIMIT_ENV =
  "ENGENTY_AI_HISTORY_TOKEN_LIMIT";

/** When the catalog does not know the model's window. The previous fixed cap. */
export const DEFAULT_HISTORY_TOKEN_LIMIT = 100_000;
/** Headroom for the reply (and reasoning) this step still has to produce. */
export const OUTPUT_RESERVE_TOKENS = 32_000;
/** The runtime-context tail is appended AFTER the limiter — reserve for it. */
export const RUNTIME_TAIL_RESERVE_TOKENS = 4000;
/** Below this the current turn's own tool results would not fit. */
export const MIN_HISTORY_TOKEN_LIMIT = 16_000;

export interface HistoryTokenBudgetInput {
  /** The model's window from the catalog; null/undefined = unknown. */
  contextTokens?: number | null;
  env?: NodeJS.ProcessEnv;
  /** Estimated tokens of the tool block the provider receives every call. */
  toolTokens?: number;
}

/**
 * Tokens the limiter may let recalled history occupy. Env override wins;
 * otherwise `context − tools − output reserve − tail reserve`, never below the
 * floor; unknown context keeps the old fixed default.
 */
export function historyTokenLimit(input: HistoryTokenBudgetInput = {}): number {
  const override = Number.parseInt(
    (input.env ?? process.env)[ENGENTY_AI_HISTORY_TOKEN_LIMIT_ENV]?.trim() ??
      "",
    10
  );
  if (Number.isFinite(override) && override > 0) {
    return Math.max(override, MIN_HISTORY_TOKEN_LIMIT);
  }
  const context = input.contextTokens;
  if (
    typeof context !== "number" ||
    !Number.isFinite(context) ||
    context <= 0
  ) {
    return DEFAULT_HISTORY_TOKEN_LIMIT;
  }
  const budget =
    context -
    Math.max(0, input.toolTokens ?? 0) -
    OUTPUT_RESERVE_TOKENS -
    RUNTIME_TAIL_RESERVE_TOKENS;
  return Math.max(Math.floor(budget), MIN_HISTORY_TOKEN_LIMIT);
}

/** The tool block's weight, measured the way the prompt preview measures it. */
export function estimateToolBlockTokens(
  tools: Record<string, unknown>
): number {
  let total = 0;
  for (const [name, tool] of Object.entries(tools)) {
    total += describePromptTool(name, tool).estimated_tokens;
  }
  return total;
}

export type ContextTokensResolver = (modelId: string) => Promise<number | null>;

/** Catalog rows rarely change; one lookup per model id per process is plenty. */
export const CONTEXT_TOKENS_CACHE_TTL_MS = 10 * 60 * 1000;

type ModelCatalogReader = Pick<AiGatewayModelStore, "listGatewayModels">;

/**
 * Looks a model id up in the platform catalog (`ai.model`) and caches the
 * answer. The same id can appear under several gateways with slightly
 * different windows; the smallest positive one is used so the budget never
 * exceeds what any route would accept. A store without the catalog half, a
 * catalog miss or a read failure all resolve to null — the budget then falls
 * back to the default, never fails the run.
 */
export function createContextTokensResolver(
  getStore: () => (AiUsageStore & Partial<ModelCatalogReader>) | null,
  options: { now?: () => number; ttlMs?: number } = {}
): ContextTokensResolver {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? CONTEXT_TOKENS_CACHE_TTL_MS;
  const cache = new Map<string, { at: number; value: number | null }>();
  return async (modelId) => {
    const id = modelId.trim();
    if (!id) {
      return null;
    }
    const hit = cache.get(id);
    if (hit && now() - hit.at < ttlMs) {
      return hit.value;
    }
    let value: number | null = null;
    try {
      const rows = await getStore()?.listGatewayModels?.({ search: id });
      const windows = (rows ?? [])
        .filter((row) => row.model_id === id)
        .map((row) => row.context_tokens)
        .filter(
          (tokens): tokens is number =>
            typeof tokens === "number" && Number.isFinite(tokens) && tokens > 0
        );
      value = windows.length > 0 ? Math.min(...windows) : null;
    } catch {
      value = null;
    }
    cache.set(id, { at: now(), value });
    return value;
  };
}
