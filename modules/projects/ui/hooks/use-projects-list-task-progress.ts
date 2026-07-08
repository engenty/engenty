import { useQuery } from "@engenty/query-client";
import { useMemo } from "react";
import { getTaskCounts } from "../api.js";
import {
  type ProjectTaskProgressSummary,
  summarizeProjectTaskCounts,
} from "../lib/project-task-progress.js";
import { projectKeys } from "../queries.js";

export function useProjectsListTaskProgress(
  projectIds: string[],
  enabled: boolean
) {
  const stableIds = useMemo(
    () => [...new Set(projectIds)].sort(),
    [projectIds]
  );

  const query = useQuery({
    queryKey: [...projectKeys.all, "list-task-progress", stableIds] as const,
    queryFn: async () => {
      const entries = await Promise.all(
        stableIds.map(async (projectId) => {
          const counts = await getTaskCounts({ project_id: projectId });
          return [projectId, summarizeProjectTaskCounts(counts)] as const;
        })
      );
      return new Map<string, ProjectTaskProgressSummary>(entries);
    },
    enabled: enabled && stableIds.length > 0,
    staleTime: 60_000,
  });

  return {
    isLoading: query.isLoading,
    progressByProjectId:
      query.data ?? new Map<string, ProjectTaskProgressSummary>(),
  };
}
