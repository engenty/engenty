import {
  beginOptimisticUpdate,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import {
  type AppearanceSettings,
  getAppearanceSettings,
  saveAppearanceSettings,
} from "@/lib/dal/appearance-settings";

export const appearanceSettingsKeys = {
  all: ["appearance-settings"] as const,
};

export const appearanceSettingsOptions = queryOptions({
  queryKey: appearanceSettingsKeys.all,
  queryFn: ({ signal }) => getAppearanceSettings(signal),
});

export function useAppearanceSettingsQuery() {
  return useQuery(appearanceSettingsOptions);
}

export function useSaveAppearanceSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      current,
      lastSaved,
    }: {
      current: AppearanceSettings;
      lastSaved: AppearanceSettings;
    }) => saveAppearanceSettings(current, lastSaved),
    onMutate: async ({ current }) => {
      const transaction = await beginOptimisticUpdate<AppearanceSettings>(
        queryClient,
        {
          queryKey: appearanceSettingsKeys.all,
          update: () => current,
        }
      );
      return { transaction };
    },
    onError: (_error, _variables, context) => {
      context?.transaction.rollback();
      toast.error("Could not save appearance settings.");
    },
    onSuccess: (_result, { current }) => {
      queryClient.setQueryData(appearanceSettingsKeys.all, current);
    },
  });
}
