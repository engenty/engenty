import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";

export type AgentModelPriceTier =
  | "cheap"
  | "low"
  | "medium"
  | "high"
  | "expensive";

export interface AgentModelOption {
  display_name: string | null;
  id: string;
  input_per_mtok_micros: number | null;
  label: string;
  model_id: string;
  output_per_mtok_micros: number | null;
  price_tier: AgentModelPriceTier | null;
  provider: string;
}

export interface AgentModelConfig {
  /**
   * The chat model the server resolves for this tenant (tenant pin → role
   * binding); null when the ai service could not resolve one.
   */
  chat_model_id: string | null;
}

interface EffectiveAiSettingsResponse {
  models?: { chat?: { value?: string | null } };
}

function trimBaseUrl(serviceBaseUrl: string): string {
  return serviceBaseUrl.trim().replace(/\/$/, "");
}

/** Reads the effective chat model from `GET /ai/v1/settings/effective`. */
export async function getAgentModelConfig(params: {
  serviceBaseUrl: string;
  signal?: AbortSignal;
}): Promise<AgentModelConfig> {
  const res = await requestApiJson<EffectiveAiSettingsResponse>(
    "/ai/v1/settings/effective",
    {
      authToken: (await getCurrentAccessToken()) ?? undefined,
      baseUrl: trimBaseUrl(params.serviceBaseUrl),
      signal: params.signal,
    }
  );
  const value = res.models?.chat?.value?.trim();
  return { chat_model_id: value || null };
}

export async function listAgentModelOptions(params: {
  serviceBaseUrl: string;
  signal?: AbortSignal;
}): Promise<{ items: AgentModelOption[] }> {
  const baseUrl = trimBaseUrl(params.serviceBaseUrl);
  const search = new URLSearchParams({
    availability_purpose: "routing",
    use_case: "text",
  });
  return await requestApiJson<{ items: AgentModelOption[] }>(
    `/ai/v1/gateway/model-options?${search.toString()}`,
    {
      authToken: (await getCurrentAccessToken()) ?? undefined,
      baseUrl,
      signal: params.signal,
    }
  );
}
