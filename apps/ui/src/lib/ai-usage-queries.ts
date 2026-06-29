import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  getAiUsageMe,
  getAiUsagePolicy,
  getAiUsageTenant,
  patchAiUsagePolicy,
} from "@/lib/api/client";

export const aiUsageKeys = {
  all: ["ai-usage"] as const,
  me: () => [...aiUsageKeys.all, "me"] as const,
  tenant: () => [...aiUsageKeys.all, "tenant"] as const,
  policy: () => [...aiUsageKeys.all, "policy"] as const,
};

export const aiUsageMeOptions = queryOptions({
  queryKey: aiUsageKeys.me(),
  queryFn: ({ signal }) => getAiUsageMe(signal),
});

export function useAiUsageMeQuery() {
  return useQuery(aiUsageMeOptions);
}

export const aiUsageTenantOptions = queryOptions({
  queryKey: aiUsageKeys.tenant(),
  queryFn: ({ signal }) => getAiUsageTenant(signal),
});

export function useAiUsageTenantQuery(enabled: boolean) {
  return useQuery({ ...aiUsageTenantOptions, enabled });
}

export const aiUsagePolicyOptions = queryOptions({
  queryKey: aiUsageKeys.policy(),
  queryFn: ({ signal }) => getAiUsagePolicy(signal),
});

export function useAiUsagePolicyQuery() {
  return useQuery(aiUsagePolicyOptions);
}

export function useUpdateAiUsagePolicyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof patchAiUsagePolicy>[0]) =>
      patchAiUsagePolicy(patch),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiUsageKeys.policy() }),
        queryClient.invalidateQueries({ queryKey: aiUsageKeys.me() }),
        queryClient.invalidateQueries({ queryKey: aiUsageKeys.tenant() }),
      ]);
    },
  });
}
