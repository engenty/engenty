import { useQuery, useQueryClient } from "@engenty/query-client";
import { useCallback } from "react";
import {
  getProject,
  type ProjectWithPhasesAndTasks,
  updateProject,
} from "../api.js";
import { enrichProjectTaskMembers } from "../lib/enrich-project-task-members.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import { projectKeys } from "../queries.js";

/**
 * Fetch the project and, as a one-time reconciliation, sync its start/end dates
 * to the phase min/max. The write only happens when they differ, so refetches
 * (e.g. live-cache invalidation) converge to a no-op rather than looping.
 */
async function fetchProjectWithDateSync(
  id: string
): Promise<ProjectWithPhasesAndTasks> {
  const p = await getProject(id);

  let minDateStr: string | null = null;
  let maxDateStr: string | null = null;
  for (const ph of p.phases) {
    for (const date of [ph.start_date, ph.end_date]) {
      if (!date) {
        continue;
      }
      if (!minDateStr || date < minDateStr) {
        minDateStr = date;
      }
      if (!maxDateStr || date > maxDateStr) {
        maxDateStr = date;
      }
    }
  }

  if (minDateStr !== p.start_date || maxDateStr !== p.end_date) {
    await updateProject(id, { start_date: minDateStr, end_date: maxDateStr });
    return await getProject(id);
  }
  return p;
}

/**
 * Project detail data, on React Query so it participates in the global live-cache
 * (agent / other-tab / API writes refresh it with no reload). Member enrichment
 * runs in `select` against the cached row, so it re-applies when the team catalog
 * arrives without forcing a refetch. Interface is unchanged from the previous
 * manual-state hook: `loadProject()` now invalidates the detail query.
 */
export function useProjectDetail(
  id: string | undefined,
  teamMembersCatalog: TeamMemberCatalogRow[]
) {
  const queryClient = useQueryClient();

  const select = useCallback(
    (p: ProjectWithPhasesAndTasks) => {
      const enriched = structuredClone(p);
      enrichProjectTaskMembers(enriched, teamMembersCatalog);
      return enriched;
    },
    [teamMembersCatalog]
  );

  const query = useQuery({
    queryKey: projectKeys.detail(id ?? "none"),
    queryFn: () => fetchProjectWithDateSync(id as string),
    enabled: Boolean(id),
    select,
  });

  const loadProject = useCallback(async () => {
    if (!id) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
  }, [id, queryClient]);

  return {
    project: query.data ?? null,
    loading: query.isLoading,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.error
          ? "Failed to load"
          : null,
    loadProject,
  };
}
