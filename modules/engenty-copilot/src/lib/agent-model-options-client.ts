import {
  parseTenantAiSettings,
  resolveChatModelId,
} from "@engenty/ai-core/browser";
import { getCurrentAccessToken, requestApiJson } from "@engenty/api-client";

const AI_CONFIG_KEY = "ai.config";

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
  chat_model_id: string | null;
  coordinator_model_id: string | null;
}

type TenantSettingApiResponse =
  | { ok: true; data: { name: string; type: string; value?: unknown } }
  | { name?: string; type?: string; value?: unknown }
  | { error: string };

export function resolveConfiguredAgentModelId(
  config: AgentModelConfig | null | undefined
): string {
  const tenantChatModel = config?.chat_model_id?.trim() || null;
  return resolveChatModelId({
    purpose: "routing",
    readEnv: () => undefined,
    tenantDefault: config?.coordinator_model_id?.trim() || tenantChatModel,
  });
}

export async function getAgentModelConfig(
  signal?: AbortSignal
): Promise<AgentModelConfig> {
  try {
    const res = await requestApiJson<TenantSettingApiResponse>(
      `/api/tenant-settings/${encodeURIComponent(AI_CONFIG_KEY)}`,
      { signal, unwrapEnvelope: false }
    );
    if ("error" in res) {
      return { chat_model_id: null, coordinator_model_id: null };
    }
    const raw =
      "data" in res && res.data != null
        ? res.data.value
        : "value" in res
          ? res.value
          : undefined;
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
      const parsed = parseTenantAiSettings(raw);
      return {
        chat_model_id: parsed.chat_model_id ?? null,
        coordinator_model_id: parsed.coordinator_model_id ?? null,
      };
    }
  } catch {
    return { chat_model_id: null, coordinator_model_id: null };
  }
  return { chat_model_id: null, coordinator_model_id: null };
}

export async function listAgentModelOptions(params: {
  serviceBaseUrl: string;
  signal?: AbortSignal;
}): Promise<{ items: AgentModelOption[] }> {
  const baseUrl = params.serviceBaseUrl.trim().replace(/\/$/, "");
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
