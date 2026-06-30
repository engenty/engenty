import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  getCompanyProfileSettings,
  setCompanyProfileSettings,
  uploadCompanyLogo,
} from "./api.js";

export const companyProfileKeys = {
  all: ["company-profile", "settings"] as const,
};

export const companyProfileSettingsOptions = queryOptions({
  queryKey: companyProfileKeys.all,
  queryFn: ({ signal }) => getCompanyProfileSettings(signal),
});

export function useCompanyProfileSettingsQuery() {
  return useQuery(companyProfileSettingsOptions);
}

export function useSetCompanyProfileSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setCompanyProfileSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyProfileKeys.all });
    },
  });
}

export function useUploadCompanyLogoMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadCompanyLogo,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: companyProfileKeys.all });
    },
  });
}
