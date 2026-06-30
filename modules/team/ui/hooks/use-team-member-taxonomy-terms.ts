import { useQuery } from "@engenty/query-client";
import { teamFilterOptionsQueryOptions } from "../team-module-queries.js";

export function useTeamMemberTaxonomyTerms() {
  const filterOptionsQuery = useQuery(teamFilterOptionsQueryOptions());
  const roleTerms =
    filterOptionsQuery.data?.find((group) => group.taxonomy.slug === "role")
      ?.terms ?? [];
  const locationTerms =
    filterOptionsQuery.data?.find((group) => group.taxonomy.slug === "location")
      ?.terms ?? [];

  return {
    isLoading: filterOptionsQuery.isLoading,
    locationTerms,
    roleTerms,
  };
}
