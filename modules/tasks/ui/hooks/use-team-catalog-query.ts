import { queryOptions, useQuery } from "@engenty/query-client";
import {
  getTeamMembersPluginState,
  type TeamMemberCatalogRow,
} from "../plugins.js";

export const teamMembersCatalogQueryKey = ["tasks", "team", "catalog"] as const;

async function fetchTeamMembersCatalog(
  api: NonNullable<ReturnType<typeof getTeamMembersPluginState>["api"]>,
  signal?: AbortSignal
): Promise<TeamMemberCatalogRow[]> {
  const members: TeamMemberCatalogRow[] = [];
  let page = 1;

  while (true) {
    const batch = await api.getTeamMembers({ page, pageSize: 200 }, signal);
    members.push(...batch);
    if (batch.length < 200) {
      return members;
    }
    page += 1;
  }
}

export function teamMembersCatalogQueryOptions(params: {
  api: ReturnType<typeof getTeamMembersPluginState>["api"];
  enabled: boolean;
}) {
  return queryOptions({
    queryKey: teamMembersCatalogQueryKey,
    queryFn: async ({ signal }) => {
      if (!params.enabled) {
        return [] as TeamMemberCatalogRow[];
      }
      if (!params.api) {
        throw new Error(
          'Plugin "team" is enabled but did not expose its UI plugin API.'
        );
      }
      return fetchTeamMembersCatalog(params.api, signal);
    },
    enabled: params.enabled,
    staleTime: 60_000,
  });
}

export function useTeamMembersCatalogQuery() {
  const pluginState = getTeamMembersPluginState();
  const query = useQuery(teamMembersCatalogQueryOptions(pluginState));
  return {
    ...query,
    pluginEnabled: pluginState.enabled,
  };
}
