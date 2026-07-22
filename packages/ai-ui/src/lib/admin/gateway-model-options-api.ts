import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";
import { getAiServiceBaseUrl } from "../runtime/ai-service-client.js";

export type GatewayModelUseCase =
  | "text"
  | "code"
  | "image"
  | "video"
  | "embed"
  | "rerank";

export type GatewayModelPriceTier =
  | "cheap"
  | "low"
  | "medium"
  | "high"
  | "expensive";

export type GatewayModelAvailabilityPurpose =
  | "chat"
  | "routing"
  | "embedding"
  | "image"
  | "video"
  | "rerank";

export interface GatewayModelOption {
  available_for_chat: boolean;
  available_for_embedding: boolean;
  available_for_image: boolean;
  available_for_rerank: boolean;
  available_for_routing: boolean;
  available_for_video: boolean;
  context_tokens: number | null;
  display_name: string | null;
  id: string;
  input_per_mtok_micros: number | null;
  label: string;
  model_id: string;
  output_per_mtok_micros: number | null;
  price_tier: GatewayModelPriceTier | null;
  provider: string;
  use_cases: GatewayModelUseCase[];
  vision: boolean;
  web_search: boolean;
}

export async function listGatewayModelOptions(
  params: {
    availability_purpose?: GatewayModelAvailabilityPurpose;
    max_price_tier?: GatewayModelPriceTier;
    search?: string;
    use_case?: GatewayModelUseCase;
  } = {},
  signal?: AbortSignal
) {
  const baseUrl = getAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  const searchParams = new URLSearchParams();
  if (params.availability_purpose) {
    searchParams.set("availability_purpose", params.availability_purpose);
  }
  if (params.max_price_tier) {
    searchParams.set("max_price_tier", params.max_price_tier);
  }
  if (params.search) {
    searchParams.set("search", params.search);
  }
  if (params.use_case) {
    searchParams.set("use_case", params.use_case);
  }
  const query = searchParams.toString();
  return await requestApiJson<{ items: GatewayModelOption[] }>(
    `/ai/v1/gateway/model-options${query ? `?${query}` : ""}`,
    {
      authToken: (await getCurrentAccessToken()) ?? undefined,
      baseUrl,
      signal,
    }
  );
}
