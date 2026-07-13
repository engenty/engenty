import { useQuery } from "@engenty/query-client";
import { getTeamMemberContracts } from "./hr-api.js";

export const contractKeys = {
  list: (profileId: string) => ["team-hr", "contracts", profileId] as const,
};

/** A team member's contract files, from team-hr's own endpoint. */
export function useTeamMemberContractsQuery(profileId: string | null) {
  return useQuery({
    queryKey: contractKeys.list(profileId ?? ""),
    queryFn: ({ signal }) => getTeamMemberContracts(profileId ?? "", signal),
    enabled: Boolean(profileId),
  });
}
