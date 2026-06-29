import { useQuery } from "@engenty/query-client";
import { useEffect, useMemo, useState } from "react";
import {
  getAgentModelConfig,
  listAgentModelOptions,
  resolveConfiguredAgentModelId,
} from "../../../src/lib/agent-model-options-client.js";

export interface AgentChatModelOption {
  label: string;
  value: string;
}

export function useAgentChatModelOptions(params: {
  isTransportReady: boolean;
  serviceBaseUrl: string;
}) {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["copilot", "model-config"],
    queryFn: ({ signal }) => getAgentModelConfig(signal),
    staleTime: 60_000,
  });
  const optionsQuery = useQuery({
    enabled: params.isTransportReady,
    queryKey: ["copilot", "model-options", params.serviceBaseUrl],
    queryFn: ({ signal }) =>
      listAgentModelOptions({
        serviceBaseUrl: params.serviceBaseUrl,
        signal,
      }),
    staleTime: 60_000,
  });

  const configuredModelId = useMemo(
    () => resolveConfiguredAgentModelId(configQuery.data),
    [configQuery.data]
  );
  const activeModelId = selectedModelId ?? configuredModelId;

  useEffect(() => {
    setSelectedModelId(null);
  }, [configuredModelId]);

  const options = useMemo<AgentChatModelOption[]>(() => {
    const byValue = new Map<string, AgentChatModelOption>();
    for (const model of optionsQuery.data?.items ?? []) {
      byValue.set(model.model_id, {
        label: model.label,
        value: model.model_id,
      });
    }
    if (!byValue.has(activeModelId)) {
      byValue.set(activeModelId, {
        label: activeModelId,
        value: activeModelId,
      });
    }
    return [...byValue.values()];
  }, [activeModelId, optionsQuery.data?.items]);

  return {
    activeModelId,
    configuredModelId,
    isLoading: configQuery.isLoading || optionsQuery.isLoading,
    options,
    selectedModelId,
    setSelectedModelId: (modelId: string) => {
      setSelectedModelId(modelId === configuredModelId ? null : modelId);
    },
  };
}
