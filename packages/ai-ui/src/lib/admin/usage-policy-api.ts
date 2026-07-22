// Client for the tenant AI usage policy (GET/PATCH /ai/v1/usage/policy).
// Surfaces enforcement mode, budget caps, billing period, and the model
// allow-list for the AI settings Limits & Budgets tab. Tenant-admin scoped.

import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";
import { getAiServiceBaseUrl } from "../runtime/ai-service-client.js";

export type UsageEnforcementMode = "observe" | "enforce";
export type UsagePeriodMode = "calendar" | "rolling";
export type UsagePeriodUnit = "day" | "week" | "month" | "year";

export interface TenantUsagePolicy {
  allowed_models: string[] | null;
  currency: string;
  enforcement_mode: UsageEnforcementMode;
  hard_limit_cost_micros: number | null;
  period_anchor: string | null;
  period_mode: UsagePeriodMode;
  period_unit: UsagePeriodUnit;
  soft_limit_cost_micros: number | null;
}

/** Fields a tenant admin may patch. Omit a field to leave it unchanged. */
export interface TenantUsagePolicyPatch {
  allowed_models?: string[] | null;
  enforcement_mode?: UsageEnforcementMode;
  hard_limit_cost_micros?: number | null;
  period_anchor?: string | null;
  period_mode?: UsagePeriodMode;
  period_unit?: UsagePeriodUnit;
  soft_limit_cost_micros?: number | null;
}

function baseUrlOrThrow(): string {
  const baseUrl = getAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  return baseUrl;
}

export async function getTenantUsagePolicy(
  signal?: AbortSignal
): Promise<TenantUsagePolicy> {
  return await requestApiJson<TenantUsagePolicy>("/ai/v1/usage/policy", {
    authToken: (await getCurrentAccessToken()) ?? undefined,
    baseUrl: baseUrlOrThrow(),
    signal,
  });
}

export async function saveTenantUsagePolicy(
  patch: TenantUsagePolicyPatch
): Promise<TenantUsagePolicy> {
  return await requestApiJson<TenantUsagePolicy>("/ai/v1/usage/policy", {
    authToken: (await getCurrentAccessToken()) ?? undefined,
    baseUrl: baseUrlOrThrow(),
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
