import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";
import { useCompanyProfileSettingsQuery } from "../queries.js";

function companyDisplayName(
  name?: string | null,
  brandName?: string | null
): string | null {
  const trimmed = name?.trim() || brandName?.trim() || null;
  return trimmed;
}

export function useCompanyProfileRootAgentUiSlice() {
  const { data } = useCompanyProfileSettingsQuery();
  const companyName = companyDisplayName(data?.name, data?.brand_name);

  const slice = useMemo(() => {
    const title = companyName ?? "Company profile";
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: title,
          page_description: companyName
            ? `Company profile for ${companyName}.`
            : "Company profile.",
        }),
      },
    };
  }, [companyName]);

  useRegisterAgentUiSlice("company-profile.root", slice);
}

export function useCompanySettingsAgentUiSlice() {
  const { data } = useCompanyProfileSettingsQuery();
  const companyName = companyDisplayName(data?.name, data?.brand_name);

  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: companyName
            ? `${companyName} settings`
            : "Company settings",
          page_description: companyName
            ? `Editing company profile settings for ${companyName} (legal, contact, brand).`
            : "Editing company profile settings (legal, contact, brand).",
        }),
      },
    }),
    [companyName]
  );

  useRegisterAgentUiSlice("company-profile.settings", slice);
}
