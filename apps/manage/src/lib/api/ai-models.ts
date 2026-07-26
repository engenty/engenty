import { requestAi } from "./http";

export const AI_MODEL_USE_CASES = [
  "text",
  "code",
  "image",
  "video",
  "embed",
  "rerank",
] as const;

export type AiModelUseCase = (typeof AI_MODEL_USE_CASES)[number];

export const AI_MODEL_PRICE_TIERS = [
  "cheap",
  "low",
  "medium",
  "high",
  "expensive",
] as const;

export type AiModelPriceTier = (typeof AI_MODEL_PRICE_TIERS)[number];

export interface AiModelAvailabilityFlags {
  available_for_chat: boolean;
  available_for_embedding: boolean;
  available_for_image: boolean;
  available_for_rerank: boolean;
  available_for_routing: boolean;
  available_for_video: boolean;
}

export interface AiGatewayModel extends AiModelAvailabilityFlags {
  cached_input_per_mtok_micros: number | null;
  context_tokens: number | null;
  display_name: string | null;
  input_per_mtok_micros: number | null;
  last_synced_at: string;
  model_id: string;
  output_per_mtok_micros: number | null;
  price_tier: AiModelPriceTier | null;
  provider: string;
  providers: string[];
  released_at: string | null;
  tags: string[];
  use_cases: AiModelUseCase[];
}

export interface AiGatewayModelSyncRun {
  completed_at: string | null;
  error_text: string | null;
  id: string;
  inserted_pricing_count: number;
  model_count: number;
  started_at: string;
  status: "failed" | "running" | "succeeded";
  trigger: "manual" | "scheduled";
  updated_model_count: number;
}

export interface AiGatewayModelSyncResult {
  inserted_pricing_count: number;
  model_count: number;
  run: AiGatewayModelSyncRun;
  updated_model_count: number;
}

export interface AiModelPricing {
  cached_input_per_mtok_micros: number;
  currency: string;
  id: string;
  input_per_mtok_micros: number;
  model_id: string;
  output_per_mtok_micros: number;
  reasoning_per_mtok_micros: number;
  valid_from: string;
  valid_to: string | null;
}

export interface AiModelPricingRestoreResult {
  availability_restored: number;
  restored: number;
}

/** Server-side catalog filters. Anything omitted is left unfiltered. */
export interface AiGatewayModelFilters {
  max_output_per_mtok_micros?: number;
  max_price_tier?: AiModelPriceTier;
  provider?: string;
  search?: string;
  use_case?: AiModelUseCase;
  web_search?: boolean;
}

export function listGatewayModels(
  filters: AiGatewayModelFilters = {},
  signal?: AbortSignal
) {
  const params = new URLSearchParams();
  if (filters.max_output_per_mtok_micros != null) {
    params.set(
      "max_output_per_mtok_micros",
      String(filters.max_output_per_mtok_micros)
    );
  }
  if (filters.max_price_tier) {
    params.set("max_price_tier", filters.max_price_tier);
  }
  if (filters.provider) {
    params.set("provider", filters.provider);
  }
  if (filters.search) {
    params.set("search", filters.search);
  }
  if (filters.use_case) {
    params.set("use_case", filters.use_case);
  }
  if (filters.web_search) {
    params.set("web_search", "true");
  }
  const query = params.toString();
  return requestAi<{ items: AiGatewayModel[] }>(
    `/ai/v1/gateway/models${query ? `?${query}` : ""}`,
    { signal }
  ).then((r) => r.items);
}

export function updateGatewayModelAvailability(
  input: { model_id: string } & Partial<AiModelAvailabilityFlags>
) {
  return requestAi<AiGatewayModel>("/ai/v1/gateway/models/availability", {
    method: "PATCH",
    body: input,
  });
}

export function syncGatewayModels(body: { update_pricing?: boolean } = {}) {
  return requestAi<AiGatewayModelSyncResult>("/ai/v1/gateway/models/sync", {
    method: "POST",
    body,
  });
}

export function listGatewayModelSyncRuns(limit = 20, signal?: AbortSignal) {
  return requestAi<{ items: AiGatewayModelSyncRun[] }>(
    `/ai/v1/gateway/models/sync-runs?limit=${limit}`,
    { signal }
  ).then((r) => r.items);
}

export function listModelPricingHistory(signal?: AbortSignal) {
  return requestAi<{ items: AiModelPricing[] }>(
    "/ai/v1/usage/model-pricing/history",
    { signal }
  ).then((r) => r.items);
}

export function restoreModelPricingDefaults() {
  return requestAi<AiModelPricingRestoreResult>(
    "/ai/v1/usage/model-pricing/restore-defaults",
    { method: "POST" }
  );
}
