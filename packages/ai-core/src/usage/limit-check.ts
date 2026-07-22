import {
  DEFAULT_TENANT_USAGE_POLICY,
  TENANT_AGGREGATE_USER_ID,
  type TenantUsagePolicyRecord,
  type UsageEnforcementMode,
  type UsageFeature,
  type UserUsagePolicyRecord,
} from "./contracts.js";
import { resolveCurrentPeriod } from "./period.js";
import { type AiUsageStore, getAiUsageStore } from "./store.js";

export type UsageLimitScope = "tenant" | "user" | "agent" | "model";
export type UsageLimitType = "cost" | "tokens" | "model_not_allowed";

export interface UsageLimitDecision {
  allowed: boolean;
  enforcement_mode: UsageEnforcementMode;
  limit_type?: UsageLimitType;
  period_end: string;
  period_start: string;
  policy?: TenantUsagePolicyRecord | null;
  reason?: string;
  remaining_cost_micros?: number | null;
  remaining_tokens?: number | null;
  resets_at?: string | null;
  scope?: UsageLimitScope;
  user_policy?: UserUsagePolicyRecord | null;
}

export interface CheckUsageLimitsParams {
  /** Per-agent cost cap (micros) for the period; null = no agent cap. */
  agent_budget_cost_micros?: number | null;
  /** Agent whose per-agent budget applies to this call (Phase 4). */
  agent_id?: string | null;
  feature?: UsageFeature;
  model_id: string;
  now?: Date;
  store?: AiUsageStore | null;
  tenant_id: string | null;
  user_id?: string | null;
}

function effectivePolicy(
  policy: TenantUsagePolicyRecord | null,
  tenantId: string
): TenantUsagePolicyRecord {
  if (policy) {
    return policy;
  }
  const nowIso = new Date().toISOString();
  return {
    tenant_id: tenantId,
    ...DEFAULT_TENANT_USAGE_POLICY,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

/**
 * Decide whether an outgoing model call is allowed under tenant + user policy.
 *
 * - In `observe` mode `allowed` is always `true` even when limits are exceeded;
 *   the decision still carries the violated scope/limit_type so callers can log
 *   would-block events and surface UI banners.
 * - In `enforce` mode `allowed=false` indicates the call must be rejected with a
 *   structured 429 response; the orchestrator is responsible for translating
 *   the decision into the wire-level error shape.
 */
export async function checkUsageLimits(
  params: CheckUsageLimitsParams
): Promise<UsageLimitDecision> {
  const store = params.store ?? getAiUsageStore();
  const now = params.now ?? new Date();

  // Without a tenant we have nothing to meter against; treat as allowed observe.
  if (!(params.tenant_id && store)) {
    return {
      allowed: true,
      enforcement_mode: "observe",
      remaining_cost_micros: null,
      remaining_tokens: null,
      resets_at: null,
      period_start: now.toISOString(),
      period_end: now.toISOString(),
    };
  }

  const policy = await store.getTenantPolicy(params.tenant_id);
  const eff = effectivePolicy(policy, params.tenant_id);
  const period = resolveCurrentPeriod(eff, now);
  const enforcement = eff.enforcement_mode;

  // Model allow-list check first — independent of accumulated usage.
  if (
    eff.allowed_models &&
    eff.allowed_models.length > 0 &&
    !eff.allowed_models.includes(params.model_id)
  ) {
    return {
      allowed: enforcement !== "enforce",
      enforcement_mode: enforcement,
      reason: `Model ${params.model_id} is not allowed for this tenant`,
      scope: "model",
      limit_type: "model_not_allowed",
      remaining_cost_micros: null,
      remaining_tokens: null,
      resets_at: period.period_end,
      policy: eff,
      period_start: period.period_start,
      period_end: period.period_end,
    };
  }

  const tenantTotalsP = store.getPeriodTotals({
    tenant_id: params.tenant_id,
    user_id: TENANT_AGGREGATE_USER_ID,
    period_start: period.period_start,
  });
  const userTotalsP = params.user_id
    ? store.getPeriodTotals({
        tenant_id: params.tenant_id,
        user_id: params.user_id,
        period_start: period.period_start,
      })
    : Promise.resolve(null);
  const userPolicyP = params.user_id
    ? store.getUserPolicy({
        tenant_id: params.tenant_id,
        user_id: params.user_id,
      })
    : Promise.resolve(null);

  const [tenantTotals, userTotals, userPolicy] = await Promise.all([
    tenantTotalsP,
    userTotalsP,
    userPolicyP,
  ]);

  const tenantCost = tenantTotals?.cost_micros ?? 0;
  const userCost = userTotals?.cost_micros ?? 0;
  const userTokens =
    (userTotals?.input_tokens ?? 0) + (userTotals?.output_tokens ?? 0);

  // Per-user override beats the tenant cap because operators set it intentionally.
  if (
    userPolicy?.max_cost_micros != null &&
    userCost >= userPolicy.max_cost_micros
  ) {
    return {
      allowed: enforcement !== "enforce",
      enforcement_mode: enforcement,
      reason: "User cost cap reached",
      scope: "user",
      limit_type: "cost",
      remaining_cost_micros: 0,
      remaining_tokens: null,
      resets_at: period.period_end,
      policy: eff,
      user_policy: userPolicy,
      period_start: period.period_start,
      period_end: period.period_end,
    };
  }
  if (
    userPolicy?.max_total_tokens != null &&
    userTokens >= userPolicy.max_total_tokens
  ) {
    return {
      allowed: enforcement !== "enforce",
      enforcement_mode: enforcement,
      reason: "User token cap reached",
      scope: "user",
      limit_type: "tokens",
      remaining_cost_micros: null,
      remaining_tokens: 0,
      resets_at: period.period_end,
      policy: eff,
      user_policy: userPolicy,
      period_start: period.period_start,
      period_end: period.period_end,
    };
  }

  // Per-agent budget sits between the user and tenant caps: an agent can be held
  // to a tighter spend than its tenant. Metered by summing usage_event for the
  // (tenant, agent) pair over the period — no per-agent totals table needed.
  if (
    params.agent_budget_cost_micros != null &&
    params.agent_id &&
    store.getAgentPeriodCostMicros
  ) {
    const agentCost = await store.getAgentPeriodCostMicros({
      tenant_id: params.tenant_id,
      agent_id: params.agent_id,
      period_start: period.period_start,
    });
    if (agentCost >= params.agent_budget_cost_micros) {
      return {
        allowed: enforcement !== "enforce",
        enforcement_mode: enforcement,
        reason: "Agent cost cap reached",
        scope: "agent",
        limit_type: "cost",
        remaining_cost_micros: 0,
        remaining_tokens: null,
        resets_at: period.period_end,
        policy: eff,
        user_policy: userPolicy,
        period_start: period.period_start,
        period_end: period.period_end,
      };
    }
  }

  if (
    eff.hard_limit_cost_micros != null &&
    tenantCost >= eff.hard_limit_cost_micros
  ) {
    return {
      allowed: enforcement !== "enforce",
      enforcement_mode: enforcement,
      reason: "Tenant cost hard limit reached",
      scope: "tenant",
      limit_type: "cost",
      remaining_cost_micros: 0,
      remaining_tokens: null,
      resets_at: period.period_end,
      policy: eff,
      user_policy: userPolicy,
      period_start: period.period_start,
      period_end: period.period_end,
    };
  }

  // Within limits: report remaining for UI banners and headers. Soft limit
  // overshoot is signalled via `reason` but never blocks the call.
  const remainingCost =
    eff.hard_limit_cost_micros == null
      ? null
      : Math.max(0, eff.hard_limit_cost_micros - tenantCost);

  let softReason: string | undefined;
  if (
    eff.soft_limit_cost_micros != null &&
    tenantCost >= eff.soft_limit_cost_micros
  ) {
    softReason = "Tenant cost soft limit reached";
  }

  return {
    allowed: true,
    enforcement_mode: enforcement,
    reason: softReason,
    scope: softReason ? "tenant" : undefined,
    limit_type: softReason ? "cost" : undefined,
    remaining_cost_micros: remainingCost,
    remaining_tokens: null,
    resets_at: period.period_end,
    policy: eff,
    user_policy: userPolicy,
    period_start: period.period_start,
    period_end: period.period_end,
  };
}

/** Wire-level shape returned by routes when enforcement blocks a request. */
export interface UsageLimitErrorBody {
  code: "usage_limit_exceeded";
  limit_type: UsageLimitType;
  message: string;
  remaining: number;
  resets_at: string | null;
  scope: UsageLimitScope;
}

/** Format a blocked decision as the structured 429 body callers should return. */
export function formatUsageLimitError(
  decision: UsageLimitDecision
): UsageLimitErrorBody {
  return {
    code: "usage_limit_exceeded",
    scope: decision.scope ?? "tenant",
    limit_type: decision.limit_type ?? "cost",
    remaining:
      decision.limit_type === "tokens"
        ? (decision.remaining_tokens ?? 0)
        : (decision.remaining_cost_micros ?? 0),
    resets_at: decision.resets_at ?? null,
    message: decision.reason ?? "Usage limit exceeded",
  };
}
