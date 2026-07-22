// Client for the tenant AI usage *report* (GET /ai/v1/usage/{me,tenant}).
// Read-only consumption totals + per-model / per-user breakdowns for the AI
// settings Usage tab. The mutable side (limits, period) lives in
// usage-policy-api.ts. Tenant-admin scoped.

import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";
import { getAiServiceBaseUrl } from "../runtime/ai-service-client.js";

export interface AiUsagePeriodTotals {
  cached_tokens: number;
  cost_micros: number;
  currency: string;
  event_count: number;
  input_tokens: number;
  last_event_at: string | null;
  output_tokens: number;
  period_end: string;
  period_start: string;
  reasoning_tokens: number;
  tenant_id: string;
  updated_at: string;
  user_id: string;
}

export interface AiUsageBreakdownByModelRow {
  cached_tokens: number;
  cost_micros: number;
  event_count: number;
  feature: string;
  input_tokens: number;
  model_id: string;
  output_tokens: number;
  reasoning_tokens: number;
}

export interface AiUsageBreakdownByUserRow {
  cached_tokens: number;
  cost_micros: number;
  event_count: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  user_display_name: string | null;
  user_email: string | null;
  user_id: string | null;
}

export interface AiUsageMeResponse {
  breakdown_by_model: AiUsageBreakdownByModelRow[];
  currency: string;
  enforcement_mode: "observe" | "enforce";
  hard_limit_cost_micros: number | null;
  period_end: string;
  period_mode: "calendar" | "rolling";
  period_start: string;
  period_unit: "day" | "week" | "month";
  remaining_cost_micros: number | null;
  soft_limit_cost_micros: number | null;
  tenant_totals: AiUsagePeriodTotals | null;
  user_totals: AiUsagePeriodTotals | null;
}

export interface AiUsageTenantResponse extends AiUsageMeResponse {
  breakdown_by_user: AiUsageBreakdownByUserRow[];
  tenant_id: string;
}

function baseUrlOrThrow(): string {
  const baseUrl = getAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  return baseUrl;
}

export async function getAiUsageMe(
  signal?: AbortSignal
): Promise<AiUsageMeResponse> {
  return await requestApiJson<AiUsageMeResponse>("/ai/v1/usage/me", {
    authToken: (await getCurrentAccessToken()) ?? undefined,
    baseUrl: baseUrlOrThrow(),
    signal,
  });
}

export async function getAiUsageTenant(
  signal?: AbortSignal
): Promise<AiUsageTenantResponse> {
  return await requestApiJson<AiUsageTenantResponse>("/ai/v1/usage/tenant", {
    authToken: (await getCurrentAccessToken()) ?? undefined,
    baseUrl: baseUrlOrThrow(),
    signal,
  });
}
