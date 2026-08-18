import { queryOptions, useQuery } from "@engenty/query-client";
import {
  type CommercialDiscipline,
  getCommercialSettingsPluginApi,
} from "../plugins.js";

/** Prefix `commercial-settings` so the commercial-settings live binding refreshes this list. */
export const commercialDisciplinesQueryKey = [
  "commercial-settings",
  "disciplines",
] as const;

export function commercialDisciplinesQueryOptions(params: {
  api: ReturnType<typeof getCommercialSettingsPluginApi>;
  enabled: boolean;
}) {
  return queryOptions({
    enabled: params.enabled,
    queryFn: async ({ signal }): Promise<CommercialDiscipline[]> => {
      if (!params.enabled) {
        return [];
      }
      if (!params.api) {
        throw new Error(
          'Plugin "commercial-settings" is enabled but did not expose its UI plugin API.'
        );
      }
      return params.api.getDisciplines(signal);
    },
    queryKey: commercialDisciplinesQueryKey,
    staleTime: 60_000,
  });
}

export function useCommercialDisciplinesQuery() {
  const api = getCommercialSettingsPluginApi();
  const enabled = api !== null;
  const query = useQuery(commercialDisciplinesQueryOptions({ api, enabled }));
  return {
    ...query,
    pluginEnabled: enabled,
  };
}
