import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";

export function useCommercialSettingsAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Commercial settings",
          page_description:
            "Commercial settings for currency, tax rates, units, disciplines, and expense categories (Kontoklasse and chart of accounts). Agents can seed region packs and look up accounts.",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("commercial-settings.settings", slice);
}
