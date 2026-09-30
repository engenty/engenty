import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { getAiConfig, saveAiConfig } from "./ai-settings-api";
import { getDocConverterAvailability } from "./doc-converter-availability-api";
import { getEffectiveAiSettings } from "./effective-ai-settings-api";
import {
  type GatewayModelAvailabilityPurpose,
  type GatewayModelPriceTier,
  type GatewayModelUseCase,
  getComposerOptions,
  listGatewayModelOptions,
} from "./gateway-model-options-api";
import { listModelRoleBindings } from "./model-bindings-api";
import { getRealtimeVoiceOptions } from "./realtime-voice-options-api";
import {
  getTenantUsagePolicy,
  saveTenantUsagePolicy,
} from "./usage-policy-api";
import { getAiUsageMe, getAiUsageTenant } from "./usage-report-api";

export const aiSettingsKeys = {
  all: ["ai-settings"] as const,
  composerOptions: ["ai-settings", "composer-options"] as const,
  effective: ["ai-settings", "effective"] as const,
  modelOptions: (filters: GatewayModelOptionFilters) =>
    [...aiSettingsKeys.all, "model-options", filters] as const,
  realtimeVoiceOptions: ["ai-settings", "realtime-voice-options"] as const,
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

export const effectiveAiSettingsOptions = queryOptions({
  queryKey: aiSettingsKeys.effective,
  queryFn: ({ signal }) => getEffectiveAiSettings(signal),
  staleTime: 60_000,
});

export function useEffectiveAiSettingsQuery() {
  return useQuery(effectiveAiSettingsOptions);
}

export const realtimeVoiceOptionsOptions = queryOptions({
  queryKey: aiSettingsKeys.realtimeVoiceOptions,
  queryFn: ({ signal }) => getRealtimeVoiceOptions(signal),
  staleTime: 60_000,
});

export function useRealtimeVoiceOptionsQuery() {
  return useQuery(realtimeVoiceOptionsOptions);
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

/**
 * The composer menu: the models behind Normal and Extra, whether the plan
 * allows Extra, and the platform's Custom list. Member-readable.
 */
export function useComposerOptionsQuery() {
  return useQuery(
    queryOptions({
      queryKey: aiSettingsKeys.composerOptions,
      queryFn: ({ signal }) => getComposerOptions(signal),
      staleTime: 5 * 60_000,
    })
  );
}

export function useSaveAiSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveAiConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: aiSettingsKeys.all });
      await queryClient.invalidateQueries({
        queryKey: aiSettingsKeys.effective,
      });
    },
  });
}

export const tenantUsagePolicyKeys = {
  all: ["ai-usage-policy"] as const,
};

export const tenantUsagePolicyOptions = queryOptions({
  queryKey: tenantUsagePolicyKeys.all,
  queryFn: ({ signal }) => getTenantUsagePolicy(signal),
  staleTime: 30_000,
});

export function useTenantUsagePolicyQuery() {
  return useQuery(tenantUsagePolicyOptions);
}

export function useSaveTenantUsagePolicyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveTenantUsagePolicy,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: tenantUsagePolicyKeys.all,
      });
    },
  });
}

export const aiUsageReportKeys = {
  all: ["ai-usage-report"] as const,
  me: () => [...aiUsageReportKeys.all, "me"] as const,
  tenant: () => [...aiUsageReportKeys.all, "tenant"] as const,
};

export function useAiUsageMeQuery() {
  return useQuery(
    queryOptions({
      queryKey: aiUsageReportKeys.me(),
      queryFn: ({ signal }) => getAiUsageMe(signal),
      staleTime: 30_000,
    })
  );
}

export function useAiUsageTenantQuery(enabled: boolean) {
  return useQuery(
    queryOptions({
      queryKey: aiUsageReportKeys.tenant(),
      queryFn: ({ signal }) => getAiUsageTenant(signal),
      staleTime: 30_000,
      enabled,
    })
  );
}

export const modelRoleBindingsOptions = queryOptions({
  queryKey: ["ai-settings", "model-role-bindings"] as const,
  queryFn: ({ signal }) => listModelRoleBindings(signal),
  staleTime: 60_000,
});

export function useModelRoleBindingsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    ...modelRoleBindingsOptions,
    enabled: options?.enabled ?? true,
  });
}
