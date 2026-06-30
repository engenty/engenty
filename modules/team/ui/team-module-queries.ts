import { queryOptions } from "@engenty/query-client";
import type { TeamTaxonomyTermUpsertInput } from "./api.js";
import {
  getTeamFilterOptions,
  getTeamGroups,
  getTeamOrgGraphData,
  getTeamSettings,
  patchTeamOrgNode,
  putTaxonomyTerms,
  type TeamOrgNodePatchInput,
} from "./api.js";

export const teamModuleKeys = {
  all: ["team", "module"] as const,
  settings: () => [...teamModuleKeys.all, "settings"] as const,
  filterOptions: () => [...teamModuleKeys.all, "filter-options"] as const,
  groups: () => [...teamModuleKeys.all, "groups"] as const,
  orgTree: () => [...teamModuleKeys.all, "org-tree"] as const,
  orgGraph: () => [...teamModuleKeys.all, "org-graph"] as const,
};

export function teamOrgGraphQueryOptions() {
  return queryOptions({
    queryKey: teamModuleKeys.orgGraph(),
    queryFn: ({ signal }) => getTeamOrgGraphData(signal),
  });
}

export function teamGroupsQueryOptions() {
  return queryOptions({
    queryKey: teamModuleKeys.groups(),
    queryFn: ({ signal }) => getTeamGroups(signal),
    staleTime: 60_000,
  });
}

export function teamSettingsQueryOptions() {
  return queryOptions({
    queryKey: teamModuleKeys.settings(),
    queryFn: ({ signal }) => getTeamSettings(signal),
  });
}

export function teamFilterOptionsQueryOptions() {
  return queryOptions({
    queryKey: teamModuleKeys.filterOptions(),
    queryFn: ({ signal }) => getTeamFilterOptions(signal),
    staleTime: 60_000,
  });
}

export async function saveTaxonomyTerms(
  taxonomySlug: string,
  terms: TeamTaxonomyTermUpsertInput[]
) {
  return putTaxonomyTerms(taxonomySlug, terms);
}

export function patchTeamOrgNodeMutationOptions() {
  return {
    mutationFn: ({
      nodeId,
      patch,
    }: {
      nodeId: string;
      patch: TeamOrgNodePatchInput;
    }) => patchTeamOrgNode(nodeId, patch),
  };
}
