import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: appearanceSettingsKeys.all,
      });
    },
  });
}
