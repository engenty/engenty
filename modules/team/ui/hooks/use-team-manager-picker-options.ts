import { useQuery } from "@engenty/query-client";
import { getTeamOrgTree } from "../api.js";
import {
  buildManagerPickerOptions,
  type ManagerPickerOption,
} from "../lib/team-manager-picker.js";
import { teamModuleKeys } from "../team-module-queries.js";

export function useTeamManagerPickerOptions(
  excludeProfileId: string | null,
  enabled = true
): {
  isLoading: boolean;
  options: ManagerPickerOption[];
} {
  const query = useQuery({
    queryKey: teamModuleKeys.orgTree(),
    queryFn: ({ signal }) => getTeamOrgTree(signal),
    enabled,
    staleTime: 60_000,
  });
  return {
    isLoading: query.isLoading,
    options: buildManagerPickerOptions(query.data ?? [], excludeProfileId),
  };
}
