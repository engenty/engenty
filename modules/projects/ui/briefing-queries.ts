import { queryOptions, useQuery } from "@engenty/query-client";
import { getProjectsBriefing, type ProjectsBriefingMode } from "./api.js";

export const projectsBriefingKeys = {
  all: ["projects", "briefing"] as const,
  snapshot: (mode: ProjectsBriefingMode) =>
    [...projectsBriefingKeys.all, mode] as const,
};

export function projectsBriefingQueryOptions(mode: ProjectsBriefingMode) {
  return queryOptions({
    queryKey: projectsBriefingKeys.snapshot(mode),
    queryFn: ({ signal }) => getProjectsBriefing({ mode }, signal),
  });
}

export function useProjectsBriefingQuery(mode: ProjectsBriefingMode) {
  return useQuery(projectsBriefingQueryOptions(mode));
}
