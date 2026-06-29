import { DEFAULT_AI_CHAT_MODEL_ID } from "@engenty/ai-core/browser";
import { queryOptions, useQuery } from "@engenty/query-client";
import { getTenantSetting } from "@/lib/api/client";

const AI_CONFIG_KEY = "ai.config";

export interface CopilotDebugAiConfig {
  chat_model_id: string | null;
  classifier_model_id: string | null;
  coordinator_model_id: string | null;
  effective_chat_model_id: string;
  source: "default" | "tenant";
}

function normalizeModelId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

async function getCopilotDebugAiConfig(
  signal?: AbortSignal
): Promise<CopilotDebugAiConfig> {
  const setting = await getTenantSetting(AI_CONFIG_KEY, signal);
  if ("error" in setting) {
    return {
      chat_model_id: null,
      classifier_model_id: null,
      coordinator_model_id: null,
      effective_chat_model_id: DEFAULT_AI_CHAT_MODEL_ID,
      source: "default",
    };
  }

  const raw = setting.value;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      chat_model_id: null,
      classifier_model_id: null,
      coordinator_model_id: null,
      effective_chat_model_id: DEFAULT_AI_CHAT_MODEL_ID,
      source: "default",
    };
  }

  const config = raw as Record<string, unknown>;
  const chatModelId = normalizeModelId(config.chat_model_id);

  return {
    chat_model_id: chatModelId,
    classifier_model_id: normalizeModelId(config.classifier_model_id),
    coordinator_model_id: normalizeModelId(config.coordinator_model_id),
    effective_chat_model_id: chatModelId ?? DEFAULT_AI_CHAT_MODEL_ID,
    source: chatModelId ? "tenant" : "default",
  };
}

export const copilotDebugAiConfigOptions = queryOptions({
  queryKey: ["copilot-debug-ai-config"],
  queryFn: ({ signal }) => getCopilotDebugAiConfig(signal),
  staleTime: 60_000,
});

export function useCopilotDebugAiConfigQuery(enabled = true) {
  return useQuery({
    ...copilotDebugAiConfigOptions,
    enabled,
  });
}
