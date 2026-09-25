import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { useEffect, useMemo, useState } from "react";
import {
  type AgentModelOption,
  type AgentModelPriceTier,
  getAgentModelConfig,
  listAgentModelOptions,
} from "../../../src/lib/agent-model-options-client.js";
import { formatModelPricingSummary } from "../../../src/lib/format-model-pricing.js";

export interface AgentChatModelOption {
  badgeLabel?: string;
  description?: string;
  group: string;
  groupLabel: string;
  keywords: string;
  label: string;
  value: string;
}

const PRICE_TIER_ORDER: Array<AgentModelPriceTier | "unknown"> = [
  "cheap",
  "low",
  "medium",
  "high",
  "expensive",
  "unknown",
];

function buildModelOption(
  model: Pick<
    AgentModelOption,
    | "display_name"
    | "input_per_mtok_micros"
    | "label"
    | "model_id"
    | "output_per_mtok_micros"
    | "price_tier"
    | "provider"
  >,
  t: (key: string) => string
): AgentChatModelOption {
  const group = model.price_tier ?? "unknown";
  const pricingSummary = formatModelPricingSummary(
    model.input_per_mtok_micros,
    model.output_per_mtok_micros,
    {
      inLabel: t("chat.modelChooser.pricingIn"),
      outLabel: t("chat.modelChooser.pricingOut"),
      perMtokLabel: t("chat.modelChooser.pricingPerMtok"),
      unknownLabel: t("chat.modelChooser.pricingUnknown"),
    }
  );
  return {
    badgeLabel: t(`chat.modelChooser.priceTier.${group}`),
    description: `${model.model_id} · ${pricingSummary}`,
    group,
    groupLabel: t(`chat.modelChooser.priceTier.${group}`),
    keywords: [model.display_name, model.model_id, model.provider]
      .filter(Boolean)
      .join(" "),
    label: model.display_name ?? model.model_id,
    value: model.model_id,
  };
}

export function useAgentChatModelOptions(params: {
  isTransportReady: boolean;
  serviceBaseUrl: string;
}) {
  const { t } = useTranslation("engenty-copilot");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const configQuery = useQuery({
    enabled: params.isTransportReady,
    queryKey: ["copilot", "model-config", params.serviceBaseUrl],
    queryFn: ({ signal }) =>
      getAgentModelConfig({ serviceBaseUrl: params.serviceBaseUrl, signal }),
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

  // Server-resolved (tenant pin → role binding); null until known.
  const configuredModelId = configQuery.data?.chat_model_id ?? null;
  const activeModelId = selectedModelId ?? configuredModelId;

  useEffect(() => {
    setSelectedModelId(null);
  }, [configuredModelId]);

  const options = useMemo<AgentChatModelOption[]>(() => {
    const byValue = new Map<string, AgentChatModelOption>();
    for (const model of optionsQuery.data?.items ?? []) {
      byValue.set(model.model_id, buildModelOption(model, t));
    }
    if (activeModelId && !byValue.has(activeModelId)) {
      byValue.set(activeModelId, {
        group: "unknown",
        groupLabel: t("chat.modelChooser.priceTier.unknown"),
        keywords: activeModelId,
        label: activeModelId,
        value: activeModelId,
      });
    }
    return PRICE_TIER_ORDER.flatMap((tier) =>
      [...byValue.values()].filter((option) => option.group === tier)
    );
  }, [activeModelId, optionsQuery.data?.items, t]);

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
