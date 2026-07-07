import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type { UiBrandInfo } from "@engenty/ui-plugin-sdk";
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

/**
 * Brand-source hook contributed to the app shell so the sidebar switcher and
 * About dialog display the tenant's own brand name and logo. Reads the same
 * settings singleton as the profile form; refreshes live via the module binding.
 */
export function useCompanyProfileBrand(): UiBrandInfo {
  const { data } = useQuery(companyProfileSettingsOptions);
  return {
    logoUrl: data?.logo_url ?? null,
    name: data?.brand_name ?? data?.name ?? null,
    tagLine: data?.tag_line ?? null,
  };
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
