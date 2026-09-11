import {
  beginOptimisticUpdate,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import type { CommercialSettings } from "./api.js";
import { getCommercialSettings, setCommercialSettings } from "./api.js";

export const commercialSettingsKeys = {
  all: ["commercial-settings"] as const,
};

export const commercialSettingsOptions = queryOptions({
  queryKey: commercialSettingsKeys.all,
  queryFn: ({ signal }) => getCommercialSettings(signal),
});

export function useCommercialSettingsQuery() {
  return useQuery(commercialSettingsOptions);
}

export function useSetCommercialSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setCommercialSettings,
    onMutate: async (input) => {
      const transaction = await beginOptimisticUpdate<CommercialSettings>(
        queryClient,
        {
          queryKey: commercialSettingsKeys.all,
          update: (current) => ({ ...current, ...input }),
        }
      );
      return { transaction };
    },
    onError: (_error, _input, context) => {
      context?.transaction.rollback();
      toast.error("Could not save commercial settings.");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(commercialSettingsKeys.all, saved);
    },
  });
}
