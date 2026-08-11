import { createLogger, getProcessLogLevel } from "@engenty/telemetry";
import type {
  ModelPricingRecord,
  UsageEventRecord,
  UsageFeature,
  UsageTokenInput,
} from "./contracts.js";
import {
  DEFAULT_TENANT_USAGE_POLICY,
  TENANT_AGGREGATE_USER_ID,
} from "./contracts.js";
import { resolveCurrentPeriod } from "./period.js";
import { FALLBACK_MODEL_PRICING } from "./seed-pricing.js";
import { type AiUsageStore, getAiUsageStore } from "./store.js";

const logger = createLogger({ name: "ai-usage-record" });

const MICROS_PER_MTOK = 1_000_000;

/**
 * Cost contribution from a single dimension. Using floor() everywhere keeps the
 * accounting deterministic and avoids integer drift on huge token counts.
 */
function costFor(tokens: number, ratePerMtokMicros: number): number {
  if (tokens <= 0 || ratePerMtokMicros <= 0) {
    return 0;
  }
  return Math.floor((tokens * ratePerMtokMicros) / MICROS_PER_MTOK);
}

export interface ResolvedUsageCost {
  cached_input_per_mtok_micros: number;
  cost_micros: number;
  currency: string;
  input_per_mtok_micros: number;
  output_per_mtok_micros: number;
  pricing_version_id: string | null;
  reasoning_per_mtok_micros: number;
}

/**
 * Compute snapshot cost from token counts and a pricing record (or fallback rates).
 *
 * `cached` and `reasoning` are SLICES, not extra dimensions: the AI SDK reports
 * `inputTokenDetails.cacheReadTokens` as the cached part of `inputTokens`, and
 * `outputTokenDetails.reasoningTokens` as the reasoning part of `outputTokens`.
 * So each slice is priced at its own rate and REMOVED from the base dimension —
 * charging the full input plus the cached read on top billed every cache hit
 * twice, which on a cache-heavy chat (75% hit rate is normal) is most of the
 * prompt. Catalog rows set the reasoning rate equal to the output rate, so the
 * output side is unchanged by this split unless a model prices reasoning apart.
 */
export function computeUsageCost(params: {
  tokens: { input: number; output: number; cached: number; reasoning: number };
  pricing: ModelPricingRecord | null;
}): ResolvedUsageCost {
  const pricing = params.pricing;
  const inputRate =
    pricing?.input_per_mtok_micros ??
    FALLBACK_MODEL_PRICING.input_per_mtok_micros;
  const outputRate =
    pricing?.output_per_mtok_micros ??
    FALLBACK_MODEL_PRICING.output_per_mtok_micros;
  const cachedRate =
    pricing?.cached_input_per_mtok_micros ??
    FALLBACK_MODEL_PRICING.cached_input_per_mtok_micros;
  const reasoningRate =
    pricing?.reasoning_per_mtok_micros ??
    FALLBACK_MODEL_PRICING.reasoning_per_mtok_micros;

  // Clamped: a provider that reports a slice larger than its base dimension
  // must not produce a negative charge.
  const cachedTokens = Math.min(params.tokens.cached, params.tokens.input);
  const freshInput = Math.max(0, params.tokens.input - cachedTokens);
  const reasoningTokens = Math.min(
    params.tokens.reasoning,
    params.tokens.output
  );
  const textOutput = Math.max(0, params.tokens.output - reasoningTokens);

  const cost =
    costFor(freshInput, inputRate) +
    costFor(cachedTokens, cachedRate) +
    costFor(textOutput, outputRate) +
    costFor(reasoningTokens, reasoningRate);

  return {
    cost_micros: cost,
    currency: pricing?.currency ?? FALLBACK_MODEL_PRICING.currency,
    input_per_mtok_micros: inputRate,
    output_per_mtok_micros: outputRate,
    cached_input_per_mtok_micros: cachedRate,
    reasoning_per_mtok_micros: reasoningRate,
    pricing_version_id: pricing?.id ?? null,
  };
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizeTokens(usage: UsageTokenInput): {
  input: number;
  output: number;
  cached: number;
  reasoning: number;
} {
  return {
    input: toNonNegativeInt(usage.input),
    output: toNonNegativeInt(usage.output),
    cached: toNonNegativeInt(usage.cached),
    reasoning: toNonNegativeInt(usage.reasoning),
  };
}

export interface RecordAiUsageInput {
  action_id?: string | null;
  agent_id?: string | null;
  feature: UsageFeature;
  model_id: string;
  occurred_at?: string;
  request_id?: string | null;
  run_id?: string | null;
  store?: AiUsageStore | null;
  tenant_id: string | null;
  thread_id?: string | null;
  usage: UsageTokenInput;
  user_id: string | null;
}

/**
 * Record a single billable model invocation.
 *
 * - Looks up active pricing for `model_id` at `occurred_at`.
 * - Inserts an immutable event row with rate snapshots and `cost_micros`.
 * - Bumps the current-period totals row for both the user (if known) and the tenant aggregate.
 *
 * Called from chat-runtime onFinish, action runner, headless executor, inbound classifier,
 * and run-agent-once. Failures are logged but never thrown — billing instrumentation
 * must not break a successful model call.
 */
export async function recordAiUsage(
  input: RecordAiUsageInput
): Promise<UsageEventRecord | null> {
  const store = input.store ?? getAiUsageStore();
  if (!store) {
    return null;
  }
  if (!input.tenant_id) {
    // Tenant-less invocations (boot smoke checks, internal health probes) are not metered.
    return null;
  }

  const tokens = normalizeTokens(input.usage);
  if (
    tokens.input === 0 &&
    tokens.output === 0 &&
    tokens.cached === 0 &&
    tokens.reasoning === 0
  ) {
    return null;
  }

  const occurredAt = input.occurred_at ?? new Date().toISOString();

  try {
    const pricing = await store.getActiveModelPricing({
      model_id: input.model_id,
      at: occurredAt,
    });
    const cost = computeUsageCost({ tokens, pricing });

    const event = await store.insertEvent({
      tenant_id: input.tenant_id,
      user_id: input.user_id ?? null,
      run_id: input.run_id ?? null,
      thread_id: input.thread_id ?? null,
      request_id: input.request_id ?? null,
      agent_id: input.agent_id ?? null,
      action_id: input.action_id ?? null,
      feature: input.feature,
      model_id: input.model_id,
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      cached_tokens: tokens.cached,
      reasoning_tokens: tokens.reasoning,
      pricing_version_id: cost.pricing_version_id,
      input_per_mtok_micros: cost.input_per_mtok_micros,
      output_per_mtok_micros: cost.output_per_mtok_micros,
      cached_input_per_mtok_micros: cost.cached_input_per_mtok_micros,
      reasoning_per_mtok_micros: cost.reasoning_per_mtok_micros,
      cost_micros: cost.cost_micros,
      currency: cost.currency,
      occurred_at: occurredAt,
    });

    // Resolve the active period for this tenant so the rollup row is keyed
    // consistently between recordAiUsage and checkUsageLimits.
    const policy = await store.getTenantPolicy(input.tenant_id);
    const period = resolveCurrentPeriod(
      policy ?? {
        period_mode: DEFAULT_TENANT_USAGE_POLICY.period_mode,
        period_unit: DEFAULT_TENANT_USAGE_POLICY.period_unit,
        period_anchor: DEFAULT_TENANT_USAGE_POLICY.period_anchor,
      },
      new Date(occurredAt)
    );

    const baseBump = {
      tenant_id: input.tenant_id,
      period_start: period.period_start,
      period_end: period.period_end,
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      cached_tokens: tokens.cached,
      reasoning_tokens: tokens.reasoning,
      cost_micros: cost.cost_micros,
      currency: cost.currency,
      occurred_at: occurredAt,
    };

    // Tenant-wide aggregate row (sentinel user_id) is always bumped so limit
    // checks can read a single row regardless of which user triggered the call.
    await store.bumpPeriodTotals({
      ...baseBump,
      user_id: TENANT_AGGREGATE_USER_ID,
    });
    if (input.user_id) {
      await store.bumpPeriodTotals({
        ...baseBump,
        user_id: input.user_id,
      });
    }

    return event;
  } catch (error) {
    if (getProcessLogLevel() === "debug") {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("recordAiUsage failed", { message });
    }
    return null;
  }
}
