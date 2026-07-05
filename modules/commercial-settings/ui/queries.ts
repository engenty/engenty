import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: commercialSettingsKeys.all,
      });
    },
  });
}
