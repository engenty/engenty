import { requestApiEnvelope } from "@engenty/api-client";
import { useQuery } from "@engenty/query-client";

export interface ProjectListItem {
  id: string;
  title: string;
}

/** Titles only — every surface that offers "which project?" shares this list. */
export function useProjectsMinimalQuery() {
  return useQuery({
    queryKey: ["projects", "list-minimal"],
    queryFn: async ({ signal }) => {
      const res = await requestApiEnvelope<ProjectListItem[]>(
        "/api/projects?pageSize=100&sortBy=title&sortOrder=asc",
        { method: "GET", signal }
      );
      return res.data;
    },
    staleTime: 60_000,
  });
}
