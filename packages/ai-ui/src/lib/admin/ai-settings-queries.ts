import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { getAiConfig, saveAiConfig } from "./ai-settings-api";
import { getDocConverterAvailability } from "./doc-converter-availability-api";
import {
  type GatewayModelAvailabilityPurpose,
  type GatewayModelPriceTier,
  type GatewayModelUseCase,
  listGatewayModelOptions,
} from "./gateway-model-options-api";

export const aiSettingsKeys = {
  all: ["ai-settings"] as const,
  modelOptions: (filters: GatewayModelOptionFilters) =>
    [...aiSettingsKeys.all, "model-options", filters] as const,
};

export interface GatewayModelOptionFilters {
  availability_purpose?: GatewayModelAvailabilityPurpose;
  max_price_tier?: GatewayModelPriceTier;
  search?: string;
  use_case?: GatewayModelUseCase;
}

export const docConverterAvailabilityKeys = {
  all: ["doc-converter-availability"] as const,
};

export const docConverterAvailabilityOptions = queryOptions({
  queryKey: docConverterAvailabilityKeys.all,
  queryFn: ({ signal }) => getDocConverterAvailability(signal),
  staleTime: 60_000,
});

export function useDocConverterAvailabilityQuery() {
  return useQuery(docConverterAvailabilityOptions);
}

export const aiSettingsOptions = queryOptions({
  queryKey: aiSettingsKeys.all,
  queryFn: ({ signal }) => getAiConfig(signal),
  staleTime: 60_000,
});

export function useAiSettingsQuery() {
  return useQuery(aiSettingsOptions);
}

export function useGatewayModelOptionsQuery(
  filters: GatewayModelOptionFilters
) {
  return useQuery(
    queryOptions({
      queryKey: aiSettingsKeys.modelOptions(filters),
      queryFn: ({ signal }) => listGatewayModelOptions(filters, signal),
      staleTime: 60_000,
    })
  );
}

export function useSaveAiSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveAiConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: aiSettingsKeys.all });
    },
  });
}
