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
  | "agent"
  | "classification"
  | "text"
  | "embedding"
  | "image"
  | "video"
  | "realtime"
  | "transcription"
  | "rerank";

export interface GatewayModelOption {
  available_for_agent: boolean;
  available_for_classification: boolean;
  available_for_embedding: boolean;
  available_for_image: boolean;
  available_for_realtime: boolean;
  available_for_rerank: boolean;
  available_for_text: boolean;
  available_for_transcription: boolean;
  available_for_video: boolean;
  context_tokens: number | null;
  display_name: string | null;
  /**
   * Which gateway serves this row. The server has always sent it; dropping it
   * here is what made two gateways' rows for the same model indistinguishable
   * in the picker — and unselectable, since the select keys on the value.
   */
  gateway: string;
  id: string;
  input_per_mtok_micros: number | null;
  label: string;
  model_id: string;
  output_per_mtok_micros: number | null;
  price_tier: GatewayModelPriceTier | null;
  provider: string;
  reasoning: boolean;
  tool_use: boolean;
  use_cases: GatewayModelUseCase[];
  vision: boolean;
  web_search: boolean;
}

export async function listGatewayModelOptions(
  params: {
    availability_purpose?: GatewayModelAvailabilityPurpose;
    /** Narrow to one gateway. Omit to offer every configured gateway's models. */
    gateway?: string;
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
  if (params.gateway) {
    searchParams.set("gateway", params.gateway);
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

/** A model on the platform's Custom list, as the composer flyout offers it. */
export interface CustomModelOption extends GatewayModelOption {
  /** Whether a reasoning level can be set on it (catalog tag + known knob). */
  reasoning_effort: boolean;
  /** The stored ref — what the composer sends as `model_id`. */
  ref: string;
}

/** The model behind Normal or Extra, as the composer menu names it. */
export interface ComposerModeModel {
  display_name: string | null;
  model_id: string;
  price_tier: GatewayModelPriceTier | null;
  provider: string | null;
  /** True = the model takes a reasoning level (show the level control). */
  reasoning_effort: boolean;
  ref: string;
}

/** What the composer menu offers, from `GET /ai/v1/gateway/composer-options`. */
export interface ComposerOptions {
  /** Empty when the platform's Custom switch is off. */
  custom_models: CustomModelOption[];
  modes: {
    extra: { allowed: boolean; model: ComposerModeModel | null };
    normal: { model: ComposerModeModel | null };
  };
}

export async function getComposerOptions(signal?: AbortSignal) {
  const baseUrl = getAiServiceBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_ENGENTY_AI_BASE_URL");
  }
  return await requestApiJson<ComposerOptions>(
    "/ai/v1/gateway/composer-options",
    {
      authToken: (await getCurrentAccessToken()) ?? undefined,
      baseUrl,
      signal,
    }
  );
}
